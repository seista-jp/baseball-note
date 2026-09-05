import type { BaseballDatabase } from "./db";
import { getDataWriteErrorMessage } from "./dataError";
import type { LogEntry, LogImage, LogTag } from "./types";
import { emptyWordHints, wordHintActivities, wordHintPrompts, type WordHintState } from "./wordHints";

export type DraftContent = {
  date: string;
  text: string;
  tags: LogTag[];
  images: LogImage[];
  wordHints: WordHintState;
};

// Completed rows contain no draft text or image. Their revision prevents a stale
// tab from resurrecting a discarded draft or saving the same draft twice.
export type DraftRow = {
  id: string;
  revision: number;
  updatedAt: string;
  state: "active" | "saved" | "discarded";
  content?: DraftContent;
};

type Token = { id: string; revision: number };
export type DraftSnapshot = {
  content: DraftContent;
  ready: boolean;
  busy: boolean;
  saving: boolean;
  pending: number;
  error: string;
  notice: string;
  alternatives: DraftRow[];
};

export const hasDraftContent = (content: DraftContent): boolean =>
  Boolean(content.text || content.tags.length || content.images.length || content.wordHints.words.length);

export function emptyDraft(date: string): DraftContent {
  return { date, text: "", tags: [], images: [], wordHints: emptyWordHints() };
}

// randomUUID is restricted to secure contexts. The Wi-Fi development preview
// uses HTTP, so keep draft protection available there as well.
export function createDraftId(randomUUID: (() => string) | null = crypto.randomUUID?.bind(crypto) ?? null): string {
  if (randomUUID) return randomUUID();

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function normalizeDraftContent(content: DraftContent): DraftContent {
  return {
    ...content,
    wordHints: Array.isArray(content.wordHints?.words)
      ? {
        words: [...new Set(content.wordHints.words.filter((word) => typeof word === "string"))],
        ...(wordHintPrompts.includes(content.wordHints.prompt as typeof wordHintPrompts[number]) ? { prompt: content.wordHints.prompt } : {}),
        ...(wordHintActivities.includes(content.wordHints.activity as typeof wordHintActivities[number]) ? { activity: content.wordHints.activity } : {}),
      }
      : emptyWordHints(),
  };
}

class DraftConflict extends Error {}

/** One serial write queue per composer; IndexedDB transactions arbitrate tabs. */
export class ComposerDraft {
  private token: Token | null = null;
  private persistedContent: DraftContent | null = null;
  private sequence = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private starting: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: DraftSnapshot;

  constructor(private database: BaseballDatabase, date: string) {
    this.snapshot = {
      content: emptyDraft(date), ready: false, busy: false, saving: false,
      pending: 0, error: "", notice: "", alternatives: [],
    };
  }

  getSnapshot = (): DraftSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(patch: Partial<DraftSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => undefined);
    return result;
  }

  async settled(): Promise<void> { await this.tail; }

  private async list(): Promise<DraftRow[]> {
    return (await this.database.composerDrafts.where("state").equals("active").toArray())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async refresh(): Promise<void> {
    try {
      const rows = await this.list();
      this.publish({ alternatives: rows.filter((row) => row.id !== this.token?.id) });
    } catch {
      this.publish({ error: "書きかけの一覧を確認できませんでした。現在の入力は残っています。" });
    }
  }

  start(): Promise<void> {
    if (!this.starting) {
      this.starting = this.enqueue(async () => {
        try {
          const rows = await this.list();
          const row = rows[0];
          if (row?.content) {
            this.token = { id: row.id, revision: row.revision };
            const content = normalizeDraftContent(row.content);
            this.persistedContent = content;
            this.publish({ content, notice: "書きかけを復元しました。" });
          }
          this.publish({ ready: true, error: "", alternatives: rows.slice(row ? 1 : 0) });
        } catch {
          this.starting = null;
          this.publish({ error: "書きかけを読み込めませんでした。保護のため、入力を開始する前に再試行してください。" });
        }
      });
    }
    return this.starting;
  }

  private async persist(content: DraftContent): Promise<void> {
    const token = this.token;
    if (!token && !hasDraftContent(content)) return;
    const result = await this.database.transaction("rw", this.database.composerDrafts, async () => {
      const row = token ? await this.database.composerDrafts.get(token.id) : undefined;
      const conflict = Boolean(token && (!row || row.revision !== token.revision || row.state !== "active"));
      // A conflict gets its own identity; never overwrite another tab's content.
      const id = !token || conflict ? createDraftId() : token.id;
      const revision = !token || conflict ? 1 : token.revision + 1;
      await this.database.composerDrafts.put({
        id, revision, updatedAt: new Date().toISOString(), state: "active", content,
      });
      return { id, revision, conflict };
    });
    this.token = { id: result.id, revision: result.revision };
    this.persistedContent = content;
    if (result.conflict) {
      this.publish({ notice: "別のタブと変更が重なったため、この入力を別の書きかけとして保護しました。" });
    }
  }

  update(patch: Partial<DraftContent>): void {
    if (!this.snapshot.ready || this.snapshot.busy) return;
    const content = { ...this.snapshot.content, ...patch };
    this.sequence += 1;
    this.publish({ content, pending: this.snapshot.pending + 1, notice: "" });
    void this.enqueue(async () => {
      try {
        await this.persist(content);
        this.publish({ error: "" });
      } catch {
        this.publish({ error: "書きかけを自動保存できませんでした。現在の入力は残っています。この画面を閉じずに再試行してください。" });
      } finally {
        this.publish({ pending: this.snapshot.pending - 1 });
      }
    });
  }

  retry(): void { this.update({}); }

  async open(id: string): Promise<void> {
    if (this.snapshot.busy || this.snapshot.saving) return;
    this.publish({ busy: true });
    await this.enqueue(async () => {
      try {
        // Protect the current buffer before switching, including a previous failed write.
        if (this.snapshot.content !== this.persistedContent) await this.persist(this.snapshot.content);
        const row = await this.database.composerDrafts.get(id);
        if (!row?.content || row.state !== "active") {
          throw new Error("書きかけは別のタブで保存・破棄されています。入力は切り替えていません。");
        }
        this.token = { id: row.id, revision: row.revision };
        const content = normalizeDraftContent(row.content);
        this.persistedContent = content;
        this.sequence += 1;
        this.publish({ content, error: "", notice: "書きかけを復元しました。" });
      } catch (error) {
        this.publish({ error: error instanceof Error ? error.message : "書きかけを開けませんでした。現在の入力は残っています。" });
      } finally {
        this.publish({ busy: false });
      }
    });
    await this.refresh();
  }

  async discard(): Promise<boolean> {
    if (!this.snapshot.ready || this.snapshot.busy || this.snapshot.saving) return false;
    this.publish({ busy: true });
    const discarded = await this.enqueue(async () => {
      try {
        const token = this.token;
        if (token) {
          await this.database.transaction("rw", this.database.composerDrafts, async () => {
            const row = await this.database.composerDrafts.get(token.id);
            if (row?.state === "active" && row.revision !== token.revision) {
              throw new DraftConflict("別のタブで更新されています。誤って消さないため破棄を中止しました。");
            }
            if (row?.state === "active") {
              await this.database.composerDrafts.put({
                id: token.id, revision: token.revision + 1,
                updatedAt: new Date().toISOString(), state: "discarded",
              });
            }
          });
        }
        this.token = null;
        this.persistedContent = null;
        this.sequence += 1;
        this.publish({ content: emptyDraft(this.snapshot.content.date), error: "", notice: "書きかけを破棄しました。" });
        return true;
      } catch (error) {
        this.publish({ error: error instanceof DraftConflict ? error.message : "書きかけを破棄できませんでした。入力と下書きは残っています。" });
        return false;
      } finally {
        this.publish({ busy: false });
      }
    });
    await this.refresh();
    return discarded;
  }

  async save(): Promise<LogEntry | null> {
    if (!this.snapshot.ready || this.snapshot.busy || this.snapshot.saving) return null;
    const content = this.snapshot.content;
    if (!content.text.trim() && !content.images.length) return null;
    const submittedSequence = this.sequence;
    this.publish({ saving: true });
    return this.enqueue(async () => {
      try {
        // Do not automatically fork at commit time: an unchanged stale tab must
        // not submit a second copy of a draft already handled elsewhere.
        let token = this.token;
        if (!token || content !== this.persistedContent) {
          await this.persist(content);
          token = this.token;
        }
        if (!token) throw new Error("下書きを保存できませんでした。");
        const savedToken = token;
        const entry: LogEntry = {
          id: savedToken.id, date: content.date, createdAt: new Date().toISOString(),
          text: content.text.trim(), tags: content.tags, images: content.images,
        };
        const outcome = await this.database.transaction(
          "rw", this.database.logs, this.database.composerDrafts, async () => {
            const row = await this.database.composerDrafts.get(savedToken.id);
            if (row?.state === "saved") return "already-saved" as const;
            if (!row || row.state !== "active" || row.revision !== savedToken.revision) {
              throw new DraftConflict("別のタブで書きかけが変更・破棄されています。現在の入力は残っています。必要なら自動保存を再試行し、内容を確認してから保存してください。");
            }
            await this.database.logs.add(entry);
            await this.database.composerDrafts.put({
              id: savedToken.id, revision: savedToken.revision + 1,
              updatedAt: new Date().toISOString(), state: "saved",
            });
            return "saved" as const;
          },
        );
        this.token = null;
        this.persistedContent = null;
        if (this.sequence === submittedSequence) {
          this.publish({ content: emptyDraft(content.date) });
        }
        this.publish({ error: "", notice: outcome === "saved" ? "記録しました。" : "この書きかけは別のタブですでに保存されています。" });
        return outcome === "saved" ? entry : null;
      } catch (error) {
        this.publish({
          error: error instanceof DraftConflict
            ? error.message
            : `${getDataWriteErrorMessage(error, "記録を保存できませんでした。もう一度試してください。")} 現在の入力と保存済みの下書きは残っています。`,
        });
        return null;
      } finally {
        this.publish({ saving: false });
      }
    });
  }
}
