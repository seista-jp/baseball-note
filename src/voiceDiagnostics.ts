import Dexie, { type EntityTable } from "dexie";
import type { UnconfirmedRecognitionResult } from "./recognition-result-merge";

export type VoiceRecognitionNotification = {
  recognitionSession: number;
  utteranceNumber: number;
  eventResultIndex: number;
  resultIndex: number;
  isFinal: boolean;
  text: string;
  mergeOutcome: string;
  mergedText: string;
  appendedVoiceText: string;
};

export type VoiceDiagnostic = {
  id: string;
  createdAt: string;
  startedAt?: string;
  savedAt?: string;
  language: "ja-JP";
  maxDurationMs: number;
  endReason: string;
  status: "in-progress" | "interrupted" | "ended" | "failed" | "aborted-by-app" | "timed-out" | "unavailable";
  resultText: string;
  unconfirmedResults: UnconfirmedRecognitionResult[];
  recognitionNotifications: VoiceRecognitionNotification[];
  events: string[];
};

type PendingVoiceDiagnostic = { key: "active"; diagnostic: VoiceDiagnostic; savedAt: string };
type VoiceDiagnosticDatabase = Dexie & {
  diagnostics: EntityTable<VoiceDiagnostic, "id">;
  pending: EntityTable<PendingVoiceDiagnostic, "key">;
};

export type VoiceDiagnosticPresentation = {
  kind: "current" | "interrupted-previous" | "previous" | "none";
  title: string;
  copyLabel: string;
  diagnostic: VoiceDiagnostic | null;
};

export function presentVoiceDiagnostic(current: VoiceDiagnostic | null, interruptedPrevious: VoiceDiagnostic | null, previous: VoiceDiagnostic | null): VoiceDiagnosticPresentation {
  if (current) return { kind: "current", title: "今回の音声入力診断", copyLabel: "今回の診断をコピー", diagnostic: current };
  if (interruptedPrevious) return { kind: "interrupted-previous", title: "中断した前回の診断", copyLabel: "中断した前回の診断をコピー", diagnostic: interruptedPrevious };
  if (previous) return { kind: "previous", title: "前回完了した診断（今回の診断ではありません）", copyLabel: "前回完了した診断をコピー", diagnostic: previous };
  return { kind: "none", title: "今回の音声入力診断", copyLabel: "今回の診断をコピー", diagnostic: null };
}

export class VoiceDiagnosticStore {
  private readonly database: VoiceDiagnosticDatabase;
  private writeTail: Promise<void> = Promise.resolve();

  constructor(name = "baseballNoteVoiceIntegrationDiagnostics") {
    this.database = new Dexie(name) as VoiceDiagnosticDatabase;
    this.database.version(1).stores({ diagnostics: "id, createdAt" });
    this.database.version(2).stores({ diagnostics: "id, createdAt", pending: "key, savedAt" });
  }

  private enqueue(write: () => Promise<void>): Promise<void> {
    const queued = this.writeTail.then(write);
    this.writeTail = queued.catch(() => undefined);
    return queued;
  }

  savePending(diagnostic: VoiceDiagnostic): Promise<void> {
    return this.enqueue(async () => {
      await this.database.pending.put({ key: "active", diagnostic, savedAt: diagnostic.savedAt ?? new Date().toISOString() });
    });
  }

  complete(diagnostic: VoiceDiagnostic): Promise<void> {
    return this.enqueue(async () => {
      await this.database.transaction("rw", this.database.diagnostics, this.database.pending, async () => {
        await this.database.diagnostics.put(diagnostic);
        await this.database.pending.delete("active");
      });
    });
  }

  async recoverPending(): Promise<VoiceDiagnostic | undefined> {
    await this.writeTail;
    const pending = await this.database.pending.get("active");
    if (!pending) return undefined;
    const diagnostic: VoiceDiagnostic = {
      ...pending.diagnostic,
      status: "interrupted",
      endReason: "再読み込みまたは画面中断のため、認識中に保存された診断です。中断直前の通知まで保存できた保証はありません。",
      savedAt: pending.savedAt,
    };
    await this.enqueue(async () => {
      await this.database.transaction("rw", this.database.diagnostics, this.database.pending, async () => {
        await this.database.diagnostics.put(diagnostic);
        await this.database.pending.delete("active");
      });
    });
    return diagnostic;
  }

  async latest(): Promise<VoiceDiagnostic | undefined> { return this.database.diagnostics.orderBy("createdAt").last(); }
}

export function createVoiceDiagnosticId(): string {
  return crypto.randomUUID?.() ?? `voice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
