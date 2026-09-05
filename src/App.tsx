import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  CalendarDays,
  CircleQuestionMark,
  Download,
  FileText,
  PencilLine,
  Search,
  ShieldCheck,
  Tag,
  Upload,
  BookOpen,
  Home,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import {
  BackupValidationError,
  buildBackupFile,
  validateBackup,
  type BackupLogEntry,
} from "./backup";
import { getDataWriteErrorMessage } from "./dataError";
import { db } from "./db";
import { ComposerDraft, hasDraftContent } from "./drafts";
import {
  formatDateHeading,
  formatDisplayDate,
  formatJapaneseDate,
  formatShortDate,
  formatTime,
  isValidDateKey,
  offsetDateKey,
  toDateKey,
} from "./date";
import { InformationScreen, type InformationPage } from "./InformationScreen";
import { RecordReviewCalendar, type DateRange } from "./RecordReviewCalendar";
import type { AiAnalysis, AiAnalysisTag, LogEntry, LogImage, LogTag } from "./types";

const todayKey = toDateKey(new Date());
const logTags: LogTag[] = ["打撃", "守備", "走塁", "投球", "体調", "フィジカル"];
const maxImageSize = 1400;
const imageQuality = 0.82;
const menuIconSize = 21;
const menuIconStrokeWidth = 1.8;
const inlineEditHintStorageKey = "baseball-note-inline-edit-hint-dismissed";
const lastBackupAtStorageKey = "baseball-note-last-backup-at";
const onboardingCompletedStorageKey = "baseball-note-onboarding-completed";
const reviewRangeStorageKey = "baseball-note-record-review-range";
const chosenFocusStorageKey = "baseball-note-chosen-focus";
export const focusReflectionNoticeText = "記録画面の『今、一番意識していること』に反映しました";
const reviewTagFilters = ["すべて", ...logTags, "その他"] as const;
const primaryFocusMarker = "【今、一番意識していること】";
const aiAnalysisPrompt = `以下は、本人がBaseball Noteに残した野球の記録です。
記録だけを根拠に、分析結果を「まず見る要点」と「詳しく読む振り返り」の2段構成で整理してください。

【まず見る要点】

文章を読むことが苦手な人でも、30秒程度で内容をつかめるようにしてください。

- 最も重要な内容を3〜5項目に絞る
- 一文を短くし、一文につき一つの内容を書く
- 難しい言葉や抽象的な表現をできるだけ避ける
- 「一番の気づき」「よく出てきたテーマ」「まだ分からないこと」「次に試すこと」を明確にする
- 次に試すことは、一度の練習で実行できる具体的な内容にする
- 「詳しく読む振り返り」を読まなくても要点が分かる内容にする

【詳しく読む振り返り】

「まず見る要点」と同じ内容を土台にして、そのように考えた理由や元の記録を、次の観点から詳しく整理してください。

1. この期間で一番大きかった気づき
2. 記録の全体傾向
3. 繰り返し出ているテーマ
4. カテゴリーをまたぐ共通点
5. 考え方の変化・発展
6. 矛盾しているように見える記録
7. 今後追いかける価値があるテーマ
8. 次に試すこと
9. この期間の自分の野球観

- 1〜9の見出しに分ける
- 結論を先に書き、その後に理由や記録上の具体例を書く
- 見出し、箇条書き、短い段落を使い、長い段落を続けない
- 「まず見る要点」をそのまま繰り返さず、根拠、変化、共通点、矛盾を補足する

分析するときは、次の条件を守ってください。

- 記録にない内容を事実のように追加しない
- 元メモの表現と意図をできるだけ尊重する
- 無理に結論を出さない
- 記録だけでは分からない場合は、「まだ判断できない」「今後確認が必要」としてよい
- 医学・科学的な正誤判定より、まず本人の記録内にある傾向を分析する

短い要点と詳しい振り返りで、事実の扱いや結論を変えないでください。`;
const primaryFocusAnalysisInstruction = `【長期判定について】

「長期判定用記録」は、選択期間や選択タグに関係なく、保存されている全期間・全カテゴリーの記録です。
この記録全体を意味の近い内容ごとにまとめ、本人が最も多く、長く意識していることを1つ判断してください。

- 選択期間だけで判断せず、長期判定用記録の全体を使う
- 同じ意味を別の言葉で書いた記録も、根拠がある場合は同じ意識としてまとめる
- 最近の記録だけで、それ以前から続く大事な意識を外さない
- 判断の根拠となる日付や記録を「詳しく読む振り返り」で示す
- 記録だけでは1つに決められない場合は、「まだ判断できない」とする

回答全体を1つのコードブロックに入れ、そのコードブロックの1行目を必ず次の形式にしてください。
${primaryFocusMarker}ここに一番意識していることを短く書く

その後に「まず見る要点」と「詳しく読む振り返り」を続けてください。`;
const aiAnalysisOutputInstruction = `Baseball Noteの「AI分析結果」へそのまま貼り付けるため、コードブロック内には分析結果以外の説明を入れないでください。`;

type ReviewTagFilter = (typeof reviewTagFilters)[number];
type AiAnalysisScreen = "list" | "save" | "detail";
type OnboardingMode = "first-run" | "help" | null;
type ComposerGuideStep = "tags" | "text" | null;
type BackupDialogMode = "export" | "import" | null;

type BackupSummary = {
  logCount: number;
  aiAnalysisCount: number;
};

type ReviewCopyStatus = {
  kind: "success" | "error";
  message: string;
};

type AnalysisHighlights = { insight: string | null; nextStep: string | null };

function loadChosenFocus(): string | null {
  try {
    const value = window.localStorage.getItem(chosenFocusStorageKey)?.trim();
    return value || null;
  } catch { return null; }
}

export function saveChosenFocus(value: string): string {
  try { window.localStorage.setItem(chosenFocusStorageKey, value); } catch { /* 現在の画面では反映する。 */ }
  return value;
}

function extractSectionValue(text: string, heading: "一番の気づき" | "次に試すこと"): string | null {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim()
    .replace(/^[-*#\d.\s]*/, "").replace(/^[【\[]/, "").startsWith(heading));
  if (index < 0) return null;
  const inline = lines[index].replace(/^.*?(一番の気づき|次に試すこと)[】\]]?[:：]?\s*/, "").trim();
  if (inline && inline !== heading) return inline;
  return lines.slice(index + 1).map((line) => line.trim()).find((line) => Boolean(line) && !/^[【\[].*[】\]]$/.test(line)) ?? null;
}

export function extractAnalysisHighlights(text: string): AnalysisHighlights | null {
  const insight = extractSectionValue(text, "一番の気づき");
  const nextStep = extractSectionValue(text, "次に試すこと");
  return insight || nextStep ? { insight, nextStep } : null;
}

export function extractAnalysisExcerpt(text: string): string {
  return extractSectionValue(text, "一番の気づき")
    ?? text.split(/\r?\n/).map((line) => line.trim()).find((line) => Boolean(line) && !/^[【\[].*[】\]]$/.test(line))
    ?? text;
}

type StoredLogEntry = Omit<LogEntry, "images" | "tags"> &
  Partial<Pick<LogEntry, "images" | "tags">>;

function readInformationPageFromHash(): InformationPage | null {
  const page = window.location.hash.replace(/^#/, "");

  if (page === "safety" || page === "privacy" || page === "terms") {
    return page;
  }

  return null;
}

function hasCompletedOnboarding(): boolean {
  try {
    return window.localStorage.getItem(onboardingCompletedStorageKey) === "1";
  } catch {
    return false;
  }
}

function loadLastBackupAt(): string | null {
  try {
    const savedAt = window.localStorage.getItem(lastBackupAtStorageKey);

    if (!savedAt || Number.isNaN(new Date(savedAt).getTime())) {
      return null;
    }

    return savedAt;
  } catch {
    return null;
  }
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("画像を読み込めませんでした。")));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("画像を変換できませんでした。"));
      },
      "image/jpeg",
      imageQuality,
    );
  });
}

async function prepareImage(file: File): Promise<LogImage> {
  const url = URL.createObjectURL(file);

  try {
    const image = await loadImage(url);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = Math.min(1, maxImageSize / largestSide);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("画像を変換できませんでした。");
    }

    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    const blob = await canvasToBlob(canvas);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";

    return {
      id: crypto.randomUUID(),
      name: `${baseName}.jpg`,
      type: blob.type,
      blob,
      createdAt: new Date().toISOString(),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function normalizeLog(log: StoredLogEntry): LogEntry {
  return {
    ...log,
    tags: log.tags ?? [],
    images: log.images ?? [],
  };
}

function sortLogsByDate(entries: StoredLogEntry[]): LogEntry[] {
  return entries
    .map(normalizeLog)
    .sort((first, second) =>
      first.date === second.date
        ? first.createdAt.localeCompare(second.createdAt)
        : first.date.localeCompare(second.date),
    );
}

function sortAiAnalysesNewest(entries: AiAnalysis[]): AiAnalysis[] {
  return [...entries].sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

function formatSavedDate(dateTime: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(dateTime));
}

function formatLastBackupAt(dateTime: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateTime));
}

function loadSavedReviewRange(): DateRange | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(reviewRangeStorageKey) ?? "null");

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const range = parsed as Record<string, unknown>;

    if (
      typeof range.start !== "string" ||
      typeof range.end !== "string" ||
      !isValidDateKey(range.start) ||
      !isValidDateKey(range.end) ||
      range.start > range.end ||
      range.end > todayKey
    ) {
      return null;
    }

    return { start: range.start, end: range.end };
  } catch {
    return null;
  }
}

function saveReviewRange(range: DateRange): void {
  try {
    window.localStorage.setItem(reviewRangeStorageKey, JSON.stringify(range));
  } catch {
    // localStorageを使用できない環境でも、現在の画面では選択した期間を表示する。
  }
}

function buildAiAnalysisText(
  range: DateRange,
  selectedTag: ReviewTagFilter,
  selectedEntries: LogEntry[],
  longTermEntries: LogEntry[],
): string {
  const formatRecords = (entries: LogEntry[]) => entries
    .map((log) => {
      const tagLabel = log.tags.length > 0 ? log.tags.join("・") : "その他";
      return `【${log.date}｜${tagLabel}】\n${log.text}`;
    })
    .join("\n\n");
  const selectedRecords = formatRecords(selectedEntries);
  const longTermRecords = formatRecords(longTermEntries);

  return `${aiAnalysisPrompt}\n\n【対象期間】\n${range.start}〜${range.end}\n\n【対象タグ】\n${selectedTag}\n\n【選択期間のBaseball Note記録】\n${selectedRecords}\n\n${primaryFocusAnalysisInstruction}\n\n【長期判定用記録（全期間・全カテゴリー）】\n${longTermRecords}\n\n${aiAnalysisOutputInstruction}`;
}

function extractPrimaryFocus(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const normalizedLine = line
      .trim()
      .replace(/^[-*]\s*/, "")
      .replace(/^\*\*/, "")
      .replace(/\*\*$/, "");

    if (!normalizedLine.startsWith(primaryFocusMarker)) {
      continue;
    }

    const focus = normalizedLine
      .slice(primaryFocusMarker.length)
      .replace(/^[:：]\s*/, "")
      .trim();

    if (focus) {
      return focus;
    }
  }

  return null;
}

async function copyTextToClipboard(textToCopy: string): Promise<void> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(textToCopy);
      return;
    }
  } catch {
    // Clipboard APIを利用できない場合は、従来のコピー操作へ切り替える。
  }

  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = textToCopy;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textToCopy.length);

  try {
    if (!document.execCommand("copy")) {
      throw new Error("クリップボードへコピーできませんでした。");
    }
  } finally {
    textarea.remove();
    activeElement?.focus();
  }
}

function tagsAreEqual(firstTags: LogTag[], secondTags: LogTag[]): boolean {
  return (
    firstTags.length === secondTags.length &&
    firstTags.every((tag, index) => tag === secondTags[index])
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "0px";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function getTextOffsetAtPoint(
  container: HTMLElement,
  clientX: number,
  clientY: number,
  textLength: number,
): number {
  const caretDocument = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number,
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caretPosition = caretDocument.caretPositionFromPoint?.(clientX, clientY);
  const caretRange = caretPosition
    ? null
    : caretDocument.caretRangeFromPoint?.(clientX, clientY) ?? null;
  const offsetNode = caretPosition?.offsetNode ?? caretRange?.startContainer;
  const offset = caretPosition?.offset ?? caretRange?.startOffset;

  if (!offsetNode || offset === undefined || !container.contains(offsetNode)) {
    return textLength;
  }

  const range = document.createRange();
  range.selectNodeContents(container);

  try {
    range.setEnd(offsetNode, offset);
    return Math.min(textLength, range.toString().length);
  } catch {
    return textLength;
  }
}

function formatSearchDateLabel(dateKey: string): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = toDateKey(yesterday);

  if (dateKey === todayKey) {
    return "今日";
  }

  if (dateKey === yesterdayKey) {
    return "昨日";
  }

  const [, month, day] = dateKey.split("-");
  return `${Number(month)}/${Number(day)}`;
}

type ImagePreviewProps = {
  image: LogImage;
  variant?: "default" | "review";
};

function ImagePreview({ image, variant = "default" }: ImagePreviewProps) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const nextUrl = URL.createObjectURL(image.blob);
    setUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [image.blob]);

  if (!url) {
    return null;
  }

  return (
    <span className={variant === "review" ? "log-image review-log-image" : "log-image"}>
      <img alt={image.name} src={url} />
    </span>
  );
}

type TagFilterProps = {
  selectedTags: LogTag[];
  onToggle: (tag: LogTag) => void;
  onClear: () => void;
};

function TagFilter({ selectedTags, onToggle, onClear }: TagFilterProps) {
  const hasSelectedTags = selectedTags.length > 0;

  return (
    <details className="search-filter">
      <summary>
        タグで絞る
        {hasSelectedTags ? <span>{selectedTags.length}件選択</span> : null}
      </summary>
      <div className="search-filter-body">
        <div className="search-filter-tags" aria-label="検索結果をタグで絞り込み">
          {logTags.map((tag) => {
            const isSelected = selectedTags.includes(tag);

            return (
              <button
                className={isSelected ? "tag-toggle selected" : "tag-toggle"}
                type="button"
                key={tag}
                onClick={() => onToggle(tag)}
                aria-pressed={isSelected}
              >
                {tag}
              </button>
            );
          })}
        </div>
        {hasSelectedTags ? (
          <button className="filter-clear-button" type="button" onClick={onClear}>
            解除
          </button>
        ) : null}
      </div>
    </details>
  );
}

type OnboardingDialogProps = {
  mode: Exclude<OnboardingMode, null>;
  onStart: () => void;
  onDismiss: () => void;
  onClose: () => void;
  onOpenSafety: (mode: Exclude<OnboardingMode, null>) => void;
};

function OnboardingDialog({
  mode,
  onStart,
  onDismiss,
  onClose,
  onOpenSafety,
}: OnboardingDialogProps) {
  const isFirstRun = mode === "first-run";
  const dialogRef = useRef<HTMLElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isFirstRun) {
        onDismiss();
      } else {
        onClose();
      }
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>("button");

    if (!focusableElements?.length) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div className="onboarding-backdrop">
      <section
        ref={dialogRef}
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
        onKeyDown={handleKeyDown}
      >
        <header className="onboarding-header">
          <span className="onboarding-eyebrow">Baseball Noteの使い方</span>
          <h2 id="onboarding-title">今日の感覚や、意識したことを記録しよう</h2>
          <p id="onboarding-description">
            練習や試合で気づいたことを短く残して、あとから振り返れます。
          </p>
        </header>

        <ol className="onboarding-steps">
          <li>
            <span className="onboarding-step-icon" aria-hidden="true">
              <Tag size={25} strokeWidth={1.8} />
            </span>
            <div>
              <h3>1. タグを選ぶ</h3>
              <p>
                打撃や守備など、記録に合うタグを選びます。選ばなくても保存できますが、選ぶとあとからタグごとに探しやすくなります。
              </p>
            </div>
          </li>
          <li>
            <span className="onboarding-step-icon" aria-hidden="true">
              <PencilLine size={25} strokeWidth={1.8} />
            </span>
            <div>
              <h3>2. 感じたことを書く</h3>
              <p>今日の感覚や気づいたことを書きます。短いひとことでも保存できます。</p>
            </div>
          </li>
          <li>
            <span className="onboarding-step-icon" aria-hidden="true">
              <CalendarDays size={25} strokeWidth={1.8} />
            </span>
            <div>
              <h3>3. あとから振り返る</h3>
              <p>「振り返り」を開くと、選んだ期間の記録をまとめて見られます。</p>
            </div>
          </li>
        </ol>

        <aside className="onboarding-safety-note" aria-label="記録の保存について">
          <div>
            <h3>記録の保存について</h3>
            <p>
              アカウント登録は不要です。記録や写真はこの端末の中に保存され、アプリの運営者には送られません。広告や、このアプリ独自のアクセス解析もありません。
            </p>
          </div>
          <button type="button" onClick={() => onOpenSafety(mode)}>
            詳しく見る
          </button>
        </aside>

        {isFirstRun ? (
          <div className="onboarding-actions">
            <button className="onboarding-start-button" type="button" onClick={onStart} autoFocus>
              始める
            </button>
            <button className="onboarding-later-button" type="button" onClick={onDismiss}>
              あとで見る
            </button>
          </div>
        ) : (
          <button className="onboarding-close-button" type="button" onClick={onClose} autoFocus>
            閉じる
          </button>
        )}
      </section>
    </div>
  );
}

type BackupDialogProps = {
  mode: Exclude<BackupDialogMode, null>;
  summary: BackupSummary | null;
  lastBackupAt: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

function BackupDialog({ mode, summary, lastBackupAt, onConfirm, onCancel }: BackupDialogProps) {
  const isExport = mode === "export";
  const dialogRef = useRef<HTMLElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled)",
    );

    if (!focusableElements?.length) {
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  return (
    <div className="backup-dialog-backdrop">
      <section
        ref={dialogRef}
        className="backup-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <header>
          <span>Baseball Note</span>
          <h2 id="backup-dialog-title">{isExport ? "データを保存する" : "データを戻す"}</h2>
        </header>

        {isExport ? (
          <div className="backup-dialog-body">
            <p>「保存する」を押すと、記録のバックアップファイルが端末に保存されます。</p>
            <p>
              バックアップファイルは、記録が消えたときや別の端末へ移すときに、記録を元に戻すためのファイルです。
            </p>
            <p>
              このファイルには記録や写真が入っているため、必要がない限り他人へ渡さず、大切に保管してください。
            </p>
            <dl className="backup-summary">
              <div>
                <dt>保存される内容</dt>
                <dd>
                  {summary
                    ? `記録${summary.logCount}件・AI分析${summary.aiAnalysisCount}件`
                    : "確認しています..."}
                </dd>
              </div>
              <div>
                <dt>最後にデータを保存した日</dt>
                <dd>{lastBackupAt ? formatLastBackupAt(lastBackupAt) : "まだ記録されていません"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="backup-dialog-body">
            <p>
              以前に「データを保存」で作ったバックアップファイルを選び、記録をこの端末へ戻します。
            </p>
            <p>
              ファイル内に同じ記録がある場合は上書きされ、それ以外の記録は追加されます。現在の記録がすべて消えることはありません。
            </p>
            <p>心配な場合は、先に現在のデータを保存してください。</p>
          </div>
        )}

        <div className="backup-dialog-actions">
          <button className="backup-dialog-cancel" type="button" onClick={onCancel} autoFocus>
            キャンセル
          </button>
          <button
            className="backup-dialog-confirm"
            type="button"
            onClick={onConfirm}
            disabled={isExport && !summary}
          >
            {isExport ? "保存する" : "ファイルを選ぶ"}
          </button>
        </div>
      </section>
    </div>
  );
}

function App() {
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchLogs, setSearchLogs] = useState<LogEntry[]>([]);
  const [reviewLogs, setReviewLogs] = useState<LogEntry[]>([]);
  const [reviewRange, setReviewRange] = useState<DateRange | null>(null);
  const [reviewTagFilter, setReviewTagFilter] = useState<ReviewTagFilter>("すべて");
  const [reviewCopyStatus, setReviewCopyStatus] = useState<ReviewCopyStatus | null>(null);
  const [chosenFocus, setChosenFocus] = useState<string | null>(loadChosenFocus);
  const [aiAnalyses, setAiAnalyses] = useState<AiAnalysis[]>([]);
  const [aiAnalysisScreen, setAiAnalysisScreen] = useState<AiAnalysisScreen>("list");
  const [selectedAiAnalysis, setSelectedAiAnalysis] = useState<AiAnalysis | null>(null);
  const [aiAnalysisStartDate, setAiAnalysisStartDate] = useState(reviewRange?.start ?? todayKey);
  const [aiAnalysisEndDate, setAiAnalysisEndDate] = useState(reviewRange?.end ?? todayKey);
  const [aiAnalysisTag, setAiAnalysisTag] = useState<AiAnalysisTag>("すべて");
  const [aiAnalysisText, setAiAnalysisText] = useState("");
  const [aiAnalysisFormMessage, setAiAnalysisFormMessage] = useState("");
  const [aiAnalysisNotice, setAiAnalysisNotice] = useState("");
  const [focusReflectionNotice, setFocusReflectionNotice] = useState("");
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [draft] = useState(() => new ComposerDraft(db, todayKey));
  const draftState = useSyncExternalStore(draft.subscribe, draft.getSnapshot);
  const text = draftState.content.text;
  const selectedTags = draftState.content.tags;
  const pendingImage = draftState.content.images[0] ?? null;
  const isSaving = draftState.saving;
  const [isPreparingImage, setIsPreparingImage] = useState(false);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);
  const imagePreparationId = useRef(0);
  const draftStarted = useRef(false);
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const hasNewDraft = hasDraftContent(draftState.content);
  const draftDate = hasNewDraft ? draftState.content.date : selectedDate;
  const composerDisabled = !draftState.ready || draftState.busy || isDiscardConfirmOpen;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFilterTags, setSelectedFilterTags] = useState<LogTag[]>([]);
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [isAiAnalysisLoading, setIsAiAnalysisLoading] = useState(false);
  const [logLoadError, setLogLoadError] = useState("");
  const [searchLoadError, setSearchLoadError] = useState("");
  const [reviewLoadError, setReviewLoadError] = useState("");
  const [aiAnalysisLoadError, setAiAnalysisLoadError] = useState("");
  const [isSavingAiAnalysis, setIsSavingAiAnalysis] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [backupDialogMode, setBackupDialogMode] = useState<BackupDialogMode>(null);
  const [backupSummary, setBackupSummary] = useState<BackupSummary | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(loadLastBackupAt);
  const [viewMode, setViewMode] = useState<"logs" | "search" | "review" | "ai-analysis">(
    "logs",
  );
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingTags, setEditingTags] = useState<LogTag[]>([]);
  const [editingMessage, setEditingMessage] = useState("");
  const [savingEditLogId, setSavingEditLogId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [informationPage, setInformationPage] = useState<InformationPage | null>(
    readInformationPageFromHash,
  );
  const [informationReturnOnboardingMode, setInformationReturnOnboardingMode] =
    useState<OnboardingMode>(() =>
      readInformationPageFromHash() && !hasCompletedOnboarding() ? "first-run" : null,
    );
  const [onboardingMode, setOnboardingMode] = useState<OnboardingMode>(() => {
    if (readInformationPageFromHash()) {
      return null;
    }

    return hasCompletedOnboarding() ? null : "first-run";
  });
  const [composerGuideStep, setComposerGuideStep] = useState<ComposerGuideStep>(null);
  const [showInlineEditHint, setShowInlineEditHint] = useState(() => {
    try {
      return window.localStorage.getItem(inlineEditHintStorageKey) !== "1";
    } catch {
      return true;
    }
  });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const composerTagsRef = useRef<HTMLDetailsElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaretRef = useRef<{ logId: string; start: number; end: number } | null>(null);

  const isToday = selectedDate === todayKey;
  const trimmedText = text.trim();
  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  const isInformationView = informationPage !== null;
  const isLogView = viewMode === "logs" && !isInformationView;
  const isSearchView = viewMode === "search" && !isInformationView;
  const isReviewView = viewMode === "review" && !isInformationView;
  const isAiAnalysisView = viewMode === "ai-analysis" && !isInformationView;
  const hasUnsavedAiAnalysisDraft = Boolean(
    viewMode === "ai-analysis" && aiAnalysisScreen === "save" && aiAnalysisText.trim(),
  );
  const hasSearchQuery = trimmedSearchQuery.length > 0;
  const canSubmit = Boolean(trimmedText || pendingImage) && !isSaving && !composerDisabled && !isPreparingImage;
  const hasFilter = selectedFilterTags.length > 0;
  const editingLog = useMemo(
    () => logs.find((log) => log.id === editingLogId) ?? null,
    [editingLogId, logs],
  );
  const hasUnsavedEdit = Boolean(
    editingLog &&
      (editingText !== editingLog.text || !tagsAreEqual(editingTags, editingLog.tags)),
  );
  const searchResults = useMemo(() => {
    const matchingLogs = searchLogs.filter((log) => {
      const matchesTags =
        !hasFilter || selectedFilterTags.some((selectedTag) => log.tags.includes(selectedTag));

      if (!matchesTags) {
        return false;
      }

      if (!hasSearchQuery) {
        return true;
      }

      const searchableText = [
        log.text,
        ...log.tags,
        log.date,
        formatDisplayDate(log.date),
      ]
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearchQuery);
    });

    return hasSearchQuery || hasFilter ? matchingLogs : matchingLogs.slice(0, 20);
  }, [hasFilter, hasSearchQuery, normalizedSearchQuery, searchLogs, selectedFilterTags]);
  const filteredReviewLogs = useMemo(() => {
    if (reviewTagFilter === "すべて") {
      return reviewLogs;
    }

    if (reviewTagFilter === "その他") {
      return reviewLogs.filter((log) => log.tags.length === 0);
    }

    return reviewLogs.filter((log) => log.tags.includes(reviewTagFilter));
  }, [reviewLogs, reviewTagFilter]);
  const reviewGroups = useMemo(() => {
    const groups = new Map<string, LogEntry[]>();

    for (const log of filteredReviewLogs) {
      const dayLogs = groups.get(log.date) ?? [];
      dayLogs.push(log);
      groups.set(log.date, dayLogs);
    }

    return Array.from(groups, ([date, dayLogs]) => ({ date, logs: dayLogs }));
  }, [filteredReviewLogs]);
  const primaryFocus = useMemo(() => {
    if (chosenFocus) return chosenFocus;
    for (const analysis of aiAnalyses) {
      const focus = extractPrimaryFocus(analysis.text);

      if (focus) {
        return focus;
      }
    }

    return null;
  }, [aiAnalyses, chosenFocus]);

  useEffect(() => {
    let active = true;
    void draft.start().then(() => {
      if (active && !draftStarted.current && draft.getSnapshot().ready) {
        draftStarted.current = true;
        setSelectedDate(draft.getSnapshot().content.date);
      }
    });
    const refreshDrafts = () => { void draft.refresh(); };
    window.addEventListener("focus", refreshDrafts);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshDrafts);
    };
  }, [draft]);

  function updateNewDraft(patch: Parameters<ComposerDraft["update"]>[0]) {
    draft.update({ date: draftDate, ...patch });
  }

  async function discardNewDraft() {
    if (await draft.discard()) {
      imagePreparationId.current += 1;
      if (imageInputRef.current) imageInputRef.current.value = "";
      setSubmitMessage("");
    }
    setIsDiscardConfirmOpen(false);
  }

  useEffect(() => {
    setReviewCopyStatus(null);
  }, [reviewLogs, reviewRange, reviewTagFilter]);

  useEffect(() => {
    function syncInformationPageWithHash() {
      const nextPage = readInformationPageFromHash();
      setInformationPage(nextPage);

      if (nextPage) {
        setOnboardingMode(null);
      }
    }

    window.addEventListener("hashchange", syncInformationPageWithHash);
    return () => window.removeEventListener("hashchange", syncInformationPageWithHash);
  }, []);

  useEffect(() => {
    if (informationPage || !informationReturnOnboardingMode) {
      return;
    }

    setOnboardingMode(informationReturnOnboardingMode);
    setInformationReturnOnboardingMode(null);
  }, [informationPage, informationReturnOnboardingMode]);

  useEffect(() => {
    if (!editingLogId) {
      editingTextareaRef.current = null;
      return;
    }

    const textarea = editingTextareaRef.current;

    if (!textarea) {
      return;
    }

    const pendingCaret = pendingCaretRef.current;

    if (pendingCaret?.logId === editingLogId) {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(pendingCaret.start, pendingCaret.end);
      pendingCaretRef.current = null;
    } else if (document.activeElement !== textarea) {
      textarea.focus({ preventScroll: true });
    }
    textarea.scrollIntoView({ block: "center" });

    const timeoutId = window.setTimeout(() => {
      editingTextareaRef.current?.scrollIntoView({ block: "nearest" });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [editingLogId]);

  useEffect(() => {
    if (!hasUnsavedEdit && !hasUnsavedAiAnalysisDraft && !draftState.pending && !draftState.error && !isPreparingImage && !isSaving) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedAiAnalysisDraft, hasUnsavedEdit, draftState.pending, draftState.error, isPreparingImage, isSaving]);

  useEffect(() => {
    if (!composerGuideStep) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target =
        composerGuideStep === "text"
          ? composerTextareaRef.current
          : document.querySelector<HTMLElement>(".tag-picker");
      target?.scrollIntoView({ block: "nearest" });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [composerGuideStep]);

  useEffect(() => {
    if (!isLogView) {
      setComposerGuideStep(null);
    }
  }, [isLogView]);

  function focusCurrentEditor() {
    window.requestAnimationFrame(() => {
      editingTextareaRef.current?.focus({ preventScroll: true });
    });
  }

  function focusLogEntry(logId: string) {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-log-id="${logId}"]`)?.focus();
    });
  }

  function focusLogList() {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".log-list")?.focus();
    });
  }

  function dismissInlineEditHint() {
    setShowInlineEditHint(false);

    try {
      window.localStorage.setItem(inlineEditHintStorageKey, "1");
    } catch {
      // localStorageを使用できない環境でも、現在の表示中は案内を閉じる。
    }
  }

  function rememberOnboardingCompletion() {
    try {
      window.localStorage.setItem(onboardingCompletedStorageKey, "1");
    } catch {
      // localStorageを使用できない環境でも、現在の表示中は案内を閉じる。
    }
  }

  function startOnboardingGuide() {
    rememberOnboardingCompletion();
    setOnboardingMode(null);
    setComposerGuideStep("tags");
  }

  function dismissOnboarding() {
    rememberOnboardingCompletion();
    setOnboardingMode(null);
    setComposerGuideStep(null);
  }

  function openHelp() {
    setOnboardingMode("help");
    closeMenu();
  }

  function updateInformationPage(page: InformationPage | null) {
    const nextUrl = page
      ? `${window.location.pathname}${window.location.search}#${page}`
      : `${window.location.pathname}${window.location.search}`;

    window.history.replaceState(null, "", nextUrl);
    setInformationPage(page);
  }

  function openSafetyFromOnboarding(mode: Exclude<OnboardingMode, null>) {
    setInformationReturnOnboardingMode(mode);
    setOnboardingMode(null);
    updateInformationPage("safety");
  }

  function prepareToLeaveEditing(): boolean {
    if (!editingLogId) {
      return true;
    }

    if (
      hasUnsavedEdit &&
      !window.confirm("編集内容が保存されていません。移動しますか？")
    ) {
      focusCurrentEditor();
      return false;
    }

    cancelEditingLog(false);
    return true;
  }

  function prepareToLeaveAiAnalysisDraft(): boolean {
    if (!hasUnsavedAiAnalysisDraft) {
      return true;
    }

    return window.confirm("入力中のAI分析が保存されていません。移動しますか？");
  }

  function openSafetyPage() {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) {
      closeMenu();
      return;
    }

    setInformationReturnOnboardingMode(null);
    updateInformationPage("safety");
    closeMenu();
  }

  function navigateInformationPage(page: InformationPage) {
    updateInformationPage(page);
    window.scrollTo({ top: 0 });
  }

  function closeInformationPage() {
    updateInformationPage(null);
    window.scrollTo({ top: 0 });
  }

  function goBackFromInformationPage() {
    if (informationPage === "privacy" || informationPage === "terms") {
      navigateInformationPage("safety");
      return;
    }

    closeInformationPage();
  }

  function closeMenu() {
    setIsMenuOpen(false);
  }

  function showTodayView() {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) {
      closeMenu();
      return;
    }

    setInformationReturnOnboardingMode(null);
    updateInformationPage(null);
    setSelectedDate(todayKey);
    setHighlightedLogId(null);
    setViewMode("logs");
    setSearchQuery("");
    closeMenu();
    window.scrollTo({ top: 0 });
  }

  function showLogView() {
    setViewMode("logs");
    setSearchQuery("");
  }

  function showSearchView() {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) {
      closeMenu();
      return;
    }

    setViewMode("search");
    setSearchQuery("");
    closeMenu();
  }

  function showRecordReview() {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) return;
    setViewMode("review");
    setReviewCopyStatus(null);
    closeMenu();
  }

  function showAiAnalysisView() {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) {
      closeMenu();
      return;
    }

    setViewMode("ai-analysis");
    setAiAnalysisScreen("list");
    setSelectedAiAnalysis(null);
    setAiAnalysisNotice("");
    closeMenu();
  }

  function openAiAnalysisSaveScreen() {
    setAiAnalysisStartDate(reviewRange?.start ?? todayKey);
    setAiAnalysisEndDate(reviewRange?.end ?? todayKey);
    setAiAnalysisTag(reviewTagFilter);
    setAiAnalysisText("");
    setAiAnalysisFormMessage("");
    setAiAnalysisNotice("");
    setSelectedAiAnalysis(null);
    setAiAnalysisScreen("save");
  }

  function openAiAnalysisDetail(analysis: AiAnalysis) {
    setSelectedAiAnalysis(analysis);
    setAiAnalysisNotice("");
    setFocusReflectionNotice("");
    setAiAnalysisScreen("detail");
  }

  function showAiAnalysisList() {
    if (!prepareToLeaveAiAnalysisDraft()) {
      return;
    }

    setAiAnalysisFormMessage("");
    setSelectedAiAnalysis(null);
    setFocusReflectionNotice("");
    setAiAnalysisScreen("list");
  }

  function openRangePicker() {
    setReviewRange((current) => current ?? loadSavedReviewRange());
    setIsRangePickerOpen(true);
  }

  function applyReviewRange(range: DateRange) {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) {
      setIsRangePickerOpen(false);
      return;
    }

    setReviewLogs([]);
    setReviewLoadError("");
    setIsReviewLoading(true);
    setReviewCopyStatus(null);
    setReviewRange(range);
    saveReviewRange(range);
    setViewMode("review");
    setIsRangePickerOpen(false);
  }

  function chooseFocus(nextStep: string) {
    setChosenFocus(saveChosenFocus(nextStep));
    setFocusReflectionNotice(focusReflectionNoticeText);
  }

  function openSearchResult(log: LogEntry) {
    setSelectedDate(log.date);
    setHighlightedLogId(log.id);
    showLogView();
  }

  function moveSelectedDate(offsetDays: number) {
    if (!prepareToLeaveEditing()) {
      return;
    }

    setSelectedDate((currentDate) => offsetDateKey(currentDate, offsetDays));
  }

  useEffect(() => {
    let isActive = true;

    async function loadLogs() {
      setIsLoading(true);
      setLogLoadError("");

      try {
        const entries = await db.logs
          .where("date")
          .equals(selectedDate)
          .sortBy("createdAt");

        if (isActive) {
          setLogs(entries.map(normalizeLog));
        }
      } catch {
        if (isActive) {
          setLogLoadError(
            "この日のメモを読み込めませんでした。画面を再読み込みして、もう一度試してください。",
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    loadLogs();

    return () => {
      isActive = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    let isActive = true;

    async function loadSearchLogs() {
      if (!isSearchView) {
        setSearchLogs([]);
        setSearchLoadError("");
        setIsSearchLoading(false);
        return;
      }

      setIsSearchLoading(true);
      setSearchLoadError("");

      try {
        const entries = await db.logs.orderBy("createdAt").toArray();

        if (isActive) {
          setSearchLogs(entries.map(normalizeLog).reverse());
        }
      } catch {
        if (isActive) {
          setSearchLoadError(
            "検索用のメモを読み込めませんでした。検索画面を開き直すか、画面を再読み込みしてください。",
          );
        }
      } finally {
        if (isActive) {
          setIsSearchLoading(false);
        }
      }
    }

    loadSearchLogs();

    return () => {
      isActive = false;
    };
  }, [isSearchView]);

  useEffect(() => {
    let isActive = true;

    async function loadReviewLogs() {
      if (!isReviewView) {
        setReviewLogs([]);
        setReviewLoadError("");
        setIsReviewLoading(false);
        return;
      }

      setIsReviewLoading(true);
      setReviewLoadError("");

      try {
        const entries = reviewRange
          ? await db.logs.where("date").between(reviewRange.start, reviewRange.end, true, true).toArray()
          : await db.logs.orderBy("createdAt").reverse().toArray();

        if (isActive) {
          setReviewLogs(reviewRange ? sortLogsByDate(entries) : entries.map(normalizeLog));
        }
      } catch {
        if (isActive) {
          setReviewLoadError(
            "選択した期間の記録を読み込めませんでした。画面を開き直すか、再読み込みしてください。",
          );
        }
      } finally {
        if (isActive) {
          setIsReviewLoading(false);
        }
      }
    }

    loadReviewLogs();

    return () => {
      isActive = false;
    };
  }, [isReviewView, reviewRange]);

  useEffect(() => {
    let isActive = true;

    async function loadAiAnalyses() {
      if (isAiAnalysisView) {
        setIsAiAnalysisLoading(true);
        setAiAnalysisLoadError("");
      }

      try {
        const entries = await db.aiAnalyses.orderBy("createdAt").reverse().toArray();

        if (isActive) {
          setAiAnalyses(entries);
        }
      } catch {
        if (isActive && isAiAnalysisView) {
          setAiAnalysisLoadError(
            "AI分析を読み込めませんでした。画面を開き直すか、再読み込みしてください。",
          );
        }
      } finally {
        if (isActive && isAiAnalysisView) {
          setIsAiAnalysisLoading(false);
        }
      }
    }

    loadAiAnalyses();

    return () => {
      isActive = false;
    };
  }, [isAiAnalysisView]);

  useEffect(() => {
    if (!highlightedLogId || isLoading || !isLogView) {
      return;
    }

    const highlightedElement = document.querySelector(`[data-log-id="${highlightedLogId}"]`);
    highlightedElement?.scrollIntoView({ block: "center" });

    const timeoutId = window.setTimeout(() => {
      setHighlightedLogId(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedLogId, isLoading, isLogView, logs]);

  useEffect(() => {
    if (!pendingImage) {
      setPendingImageUrl("");
      return;
    }

    const url = URL.createObjectURL(pendingImage.blob);
    setPendingImageUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [pendingImage]);

  useEffect(() => {
    if (composerTextareaRef.current) resizeTextarea(composerTextareaRef.current);
  }, [text]);

  const emptyMessage = useMemo(() => {
    if (isToday) {
      return "今日の感覚を短く書いて保存します。";
    }

    return "この日の記録はまだありません。";
  }, [isToday]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitMessage("");
    const saved = await draft.save();
    if (saved) {
      composerTagsRef.current?.removeAttribute("open");
    }
    if (!draft.getSnapshot().error) {
      // A date switch during a slow save must not insert the entry into another day.
      const displayedDate = selectedDateRef.current;
      const entries = await db.logs.where("date").equals(displayedDate).sortBy("createdAt").catch(() => null);
      if (entries && selectedDateRef.current === displayedDate) setLogs(entries.map(normalizeLog));
      else if (!entries) setSubmitMessage("記録は保存できました。表示を更新するには日付を開き直してください。");
    }
    if (!draft.getSnapshot().content.images.length && imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const preparationId = ++imagePreparationId.current;
    const imageDate = draftDate;
    setIsPreparingImage(true);
    setSubmitMessage("画像を準備しています。この表示が消えるまで画面を閉じないでください。");
    try {
      const image = await prepareImage(file);
      if (preparationId !== imagePreparationId.current) return;
      draft.update({ date: hasDraftContent(draft.getSnapshot().content) ? draft.getSnapshot().content.date : imageDate, images: [image] });
      setSubmitMessage("");
    } catch {
      setSubmitMessage("画像を読み込めませんでした。本文と元の添付画像は残っています。別の画像で試してください。");
    } finally {
      if (preparationId === imagePreparationId.current) setIsPreparingImage(false);
    }
  }

  function clearPendingImage() {
    imagePreparationId.current += 1;
    updateNewDraft({ images: [] });
    if (imageInputRef.current) imageInputRef.current.value = "";
  }

  function toggleTag(tag: LogTag) {
    updateNewDraft({ tags: selectedTags.includes(tag)
      ? selectedTags.filter((currentTag) => currentTag !== tag)
      : [...selectedTags, tag] });
  }

  function toggleFilterTag(tag: LogTag) {
    setSelectedFilterTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
  }

  function selectReviewTagFilter(tagFilter: ReviewTagFilter) {
    setReviewTagFilter(tagFilter);
    setReviewCopyStatus(null);
  }

  async function handleCopyReviewForAi() {
    if (!reviewRange || filteredReviewLogs.length === 0 || isReviewLoading || reviewLoadError) {
      return;
    }

    setReviewCopyStatus(null);

    try {
      const allEntries = await db.logs.orderBy("createdAt").toArray();
      const longTermEntries = sortLogsByDate(allEntries);

      await copyTextToClipboard(
        buildAiAnalysisText(
          reviewRange,
          reviewTagFilter,
          filteredReviewLogs,
          longTermEntries,
        ),
      );
      setReviewCopyStatus({
        kind: "success",
        message: "AI分析用の記録をコピーしました",
      });
    } catch {
      setReviewCopyStatus({
        kind: "error",
        message: "コピーできませんでした。ブラウザのクリップボード権限を確認してください。",
      });
    }
  }

  async function handleSaveAiAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const savedText = aiAnalysisText;

    if (
      !isValidDateKey(aiAnalysisStartDate) ||
      !isValidDateKey(aiAnalysisEndDate) ||
      aiAnalysisStartDate > aiAnalysisEndDate ||
      aiAnalysisEndDate > todayKey
    ) {
      setAiAnalysisFormMessage("期間を正しく入力してください。");
      return;
    }

    if (!savedText.trim()) {
      setAiAnalysisFormMessage("AI分析結果を入力してください。");
      return;
    }

    const analysis: AiAnalysis = {
      id: crypto.randomUUID(),
      startDate: aiAnalysisStartDate,
      endDate: aiAnalysisEndDate,
      tag: aiAnalysisTag,
      text: savedText,
      createdAt: new Date().toISOString(),
    };

    setIsSavingAiAnalysis(true);
    setAiAnalysisFormMessage("");

    try {
      await db.aiAnalyses.add(analysis);
      setAiAnalyses((currentAnalyses) =>
        sortAiAnalysesNewest([...currentAnalyses, analysis]),
      );
      setAiAnalysisText("");
      setAiAnalysisNotice("まとめを保存しました。");
      setAiAnalysisScreen("list");
    } catch (error) {
      setAiAnalysisFormMessage(
        `${getDataWriteErrorMessage(
          error,
          "AI分析を保存できませんでした。もう一度試してください。",
        )} 入力内容は残っています。`,
      );
    } finally {
      setIsSavingAiAnalysis(false);
    }
  }

  function startEditingLog(log: LogEntry): boolean {
    dismissInlineEditHint();

    if (editingLogId === log.id) {
      return true;
    }

    if (
      editingLogId &&
      hasUnsavedEdit &&
      !window.confirm("編集内容が保存されていません。別のメモを編集しますか？")
    ) {
      focusCurrentEditor();
      return false;
    }

    setEditingLogId(log.id);
    setEditingText(log.text);
    setEditingTags(log.tags);
    setEditingMessage("");
    return true;
  }

  function cancelEditingLog(restoreFocus = true, focusLogId = editingLogId) {
    setEditingLogId(null);
    setEditingText("");
    setEditingTags([]);
    setEditingMessage("");

    if (restoreFocus && focusLogId) {
      focusLogEntry(focusLogId);
    }
  }

  function toggleEditingTag(tag: LogTag) {
    setEditingTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
  }

  async function handleUpdateLog(log: LogEntry) {
    const nextText = editingText.trim();

    if (log.text.trim() && !nextText) {
      const shouldDelete = window.confirm("本文が空です。このメモを削除しますか？");

      if (!shouldDelete) {
        focusCurrentEditor();
        return;
      }

      setSavingEditLogId(log.id);
      setEditingMessage("");
      const wasDeleted = await deleteLog(log.id);
      setSavingEditLogId(null);

      if (wasDeleted) {
        cancelEditingLog(false);
        focusLogList();
      }

      return;
    }

    const updatedLog: LogEntry = {
      ...log,
      text: nextText,
      tags: editingTags,
    };

    setSavingEditLogId(log.id);
    setEditingMessage("");

    try {
      await db.logs.put(updatedLog);
      setLogs((currentLogs) =>
        currentLogs.map((currentLog) => (currentLog.id === log.id ? updatedLog : currentLog)),
      );
      setSearchLogs((currentLogs) =>
        currentLogs.map((currentLog) => (currentLog.id === log.id ? updatedLog : currentLog)),
      );
      setReviewLogs((currentLogs) =>
        currentLogs.map((currentLog) => (currentLog.id === log.id ? updatedLog : currentLog)),
      );
      cancelEditingLog(true, log.id);
    } catch (error) {
      setEditingMessage(
        `${getDataWriteErrorMessage(
          error,
          "変更を保存できませんでした。もう一度試してください。",
        )} 編集内容は残っています。`,
      );
    } finally {
      setSavingEditLogId(null);
    }
  }

  async function deleteLog(logId: string): Promise<boolean> {
    setOperationError("");

    try {
      await db.logs.delete(logId);
      setLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
      setSearchLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
      setReviewLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
      return true;
    } catch {
      setOperationError(
        "メモを削除できませんでした。メモは残っています。もう一度試してください。",
      );
      return false;
    }
  }

  async function handleDeleteLog(logId: string) {
    const shouldDelete = window.confirm("このメモを削除しますか？");

    if (!shouldDelete) {
      focusCurrentEditor();
      return;
    }

    setSavingEditLogId(logId);
    const wasDeleted = await deleteLog(logId);
    setSavingEditLogId(null);

    if (wasDeleted) {
      cancelEditingLog(false);
      focusLogList();
    }
  }

  async function openExportBackupDialog() {
    setOperationError("");
    setBackupSummary(null);
    setBackupDialogMode("export");
    closeMenu();

    try {
      const [logCount, aiAnalysisCount] = await Promise.all([
        db.logs.count(),
        db.aiAnalyses.count(),
      ]);
      setBackupSummary({ logCount, aiAnalysisCount });
    } catch {
      const message =
        "保存するデータの件数を確認できませんでした。画面を再読み込みして、もう一度試してください。";
      setBackupDialogMode(null);
      setOperationError(message);
    }
  }

  function openImportBackupDialog() {
    if (!prepareToLeaveEditing() || !prepareToLeaveAiAnalysisDraft()) {
      closeMenu();
      return;
    }

    setBackupDialogMode("import");
    closeMenu();
  }

  function selectBackupFile() {
    setBackupDialogMode(null);
    window.requestAnimationFrame(() => importInputRef.current?.click());
  }

  async function handleExportBackup() {
    setBackupDialogMode(null);
    setOperationError("");
    let url = "";

    try {
      const allLogs = await db.logs.orderBy("createdAt").toArray();
      const allAiAnalyses = await db.aiAnalyses.orderBy("createdAt").toArray();
      const backupLogs: BackupLogEntry[] = await Promise.all(
        allLogs.map(async (log) => {
          const normalizedLog = normalizeLog(log);

          return {
            ...normalizedLog,
            images: await Promise.all(
              normalizedLog.images.map(async (image) => ({
                id: image.id,
                name: image.name,
                type: image.type,
                createdAt: image.createdAt,
                dataUrl: await readFileAsDataUrl(image.blob),
              })),
            ),
          };
        }),
      );

      const blob = new Blob(
        [
          JSON.stringify(
            buildBackupFile(backupLogs, allAiAnalyses),
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `baseball-note-backup-${todayKey}.json`;
      link.click();
      const savedAt = new Date().toISOString();
      setLastBackupAt(savedAt);

      try {
        window.localStorage.setItem(lastBackupAtStorageKey, savedAt);
      } catch {
        // 保存日は補助表示のため、記録できない環境でもバックアップ書き出しは完了させる。
      }
      setBackupMessage(
        `メモ${allLogs.length}件、AI分析${allAiAnalyses.length}件を書き出しました。`,
      );
    } catch {
      const message =
        "バックアップを書き出せませんでした。画面を再読み込みして、もう一度試してください。";
      setBackupMessage(message);
      setOperationError(message);
    } finally {
      if (url) {
        URL.revokeObjectURL(url);
      }
    }
  }

  async function handleImportBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    let importWasApplied = false;

    if (!file) {
      return;
    }

    try {
      setOperationError("");
      setBackupMessage("バックアップを確認しています。");
      const parsed: unknown = JSON.parse(await file.text());
      const { logs: backupLogs, aiAnalyses: backupAiAnalyses } = validateBackup(parsed);
      const existingLogs = await db.logs.bulkGet(backupLogs.map((log) => log.id));
      const existingAiAnalyses = await db.aiAnalyses.bulkGet(
        backupAiAnalyses.map((analysis) => analysis.id),
      );
      const logOverwriteCount = existingLogs.filter((log) => log !== undefined).length;
      const logNewCount = backupLogs.length - logOverwriteCount;
      const aiAnalysisOverwriteCount = existingAiAnalyses.filter(
        (analysis) => analysis !== undefined,
      ).length;
      const aiAnalysisNewCount = backupAiAnalyses.length - aiAnalysisOverwriteCount;

      if (backupLogs.length === 0 && backupAiAnalyses.length === 0) {
        setBackupMessage(
          "このバックアップに読み込めるメモやAI分析はありません。既存データは変更していません。",
        );
        return;
      }

      const shouldImport = window.confirm(
        `メモ${backupLogs.length}件とAI分析${backupAiAnalyses.length}件を読み込みます。\n` +
          `メモ（新規${logNewCount}件、上書き${logOverwriteCount}件）\n` +
          `AI分析（新規${aiAnalysisNewCount}件、上書き${aiAnalysisOverwriteCount}件）\n\n` +
          "同じIDのデータは上書きされます。読み込みを続けますか？",
      );

      if (!shouldImport) {
        setBackupMessage("読み込みを中止しました。既存データは変更していません。");
        return;
      }

      const restoredLogs: LogEntry[] = await Promise.all(
        backupLogs.map(async (log) => ({
          id: log.id,
          date: log.date,
          createdAt: log.createdAt,
          text: log.text,
          tags: log.tags ?? [],
          images: await Promise.all(
            log.images.map(async (image) => ({
              id: image.id,
              name: image.name,
              type: image.type,
              createdAt: image.createdAt,
              blob: await dataUrlToBlob(image.dataUrl),
            })),
          ),
        })),
      );

      await db.transaction("rw", db.logs, db.aiAnalyses, async () => {
        if (restoredLogs.length > 0) {
          await db.logs.bulkPut(restoredLogs);
        }
        if (backupAiAnalyses.length > 0) {
          await db.aiAnalyses.bulkPut(backupAiAnalyses);
        }
      });
      importWasApplied = true;
      const entries = await db.logs.where("date").equals(selectedDate).sortBy("createdAt");
      setLogs(entries.map(normalizeLog));
      if (isSearchView) {
        const allEntries = await db.logs.orderBy("createdAt").toArray();
        setSearchLogs(allEntries.map(normalizeLog).reverse());
      }
      if (isReviewView && reviewRange) {
        const reviewEntries = await db.logs
          .where("date")
          .between(reviewRange.start, reviewRange.end, true, true)
          .toArray();
        setReviewLogs(sortLogsByDate(reviewEntries));
      }
      const allAiAnalyses = await db.aiAnalyses.orderBy("createdAt").reverse().toArray();
      setAiAnalyses(allAiAnalyses);
      if (isAiAnalysisView) {
        if (selectedAiAnalysis) {
          setSelectedAiAnalysis(
            allAiAnalyses.find((analysis) => analysis.id === selectedAiAnalysis.id) ?? null,
          );
        }
      }
      setBackupMessage(
        `メモ${restoredLogs.length}件、AI分析${backupAiAnalyses.length}件を読み込みました。`,
      );
    } catch (error) {
      if (importWasApplied) {
        const message =
          "データは読み込めましたが、画面を更新できませんでした。アプリを開き直してください。";
        setBackupMessage(message);
        setOperationError(message);
      } else {
        const reason =
          error instanceof BackupValidationError
            ? error.message
            : error instanceof SyntaxError
              ? "JSONファイルの形式が正しくありません。"
              : getDataWriteErrorMessage(
                  error,
                  "ファイルの読み取りまたはデータの保存に失敗しました。もう一度試してください。",
                );
        const message = `${reason} 既存データは変更していません。`;
        setBackupMessage(message);
        setOperationError(message);
      }
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button
          className="menu-button"
          type="button"
          onClick={() => setIsMenuOpen(true)}
          aria-label="メニューを開く"
          aria-expanded={isMenuOpen}
          aria-controls="app-menu"
        >
          <span />
          <span />
          <span />
        </button>
        <button
          className="mobile-brand-title"
          type="button"
          onClick={showTodayView}
          aria-label="今日の記録へ戻る"
        >
          Baseball Note
        </button>
        {isLogView ? (
          <>
            <h1 className="mobile-context-heading">{isToday ? "今日の記録" : "過去の記録"}</h1>
            <div className="mobile-date-controls" aria-label="日付移動">
              <button
                className="mobile-date-nav-button"
                type="button"
                onClick={() => moveSelectedDate(-1)}
                aria-label="前日へ移動"
              >
                ＜
              </button>
              <span className="mobile-selected-date">{formatShortDate(selectedDate)}</span>
              {isToday ? <span className="mobile-today-label">今日</span> : null}
              <button
                className="mobile-date-nav-button"
                type="button"
                onClick={() => moveSelectedDate(1)}
                aria-label="翌日へ移動"
                disabled={isToday}
              >
                ＞
              </button>
            </div>
          </>
        ) : null}
      </header>

      {isMenuOpen ? (
        <button className="menu-backdrop" type="button" onClick={closeMenu} aria-label="メニューを閉じる" />
      ) : null}

      <aside className={isMenuOpen ? "sidebar menu-open" : "sidebar"} id="app-menu" aria-label="メニュー">
        <div className="sidebar-top">
          <button
            className="brand"
            type="button"
            onClick={showTodayView}
            aria-label="今日の記録へ戻る"
          >
            <img src={`${import.meta.env.BASE_URL}baseball-note-logo.svg`} alt="" className="brand-mark" />
            <span className="brand-title">Baseball Note</span>
          </button>
          <button className="menu-close-button" type="button" onClick={closeMenu} aria-label="メニューを閉じる">
            閉じる
          </button>
        </div>

        <nav className="nav-list">
          <button
            className={isSearchView ? "nav-item active" : "nav-item"}
            type="button"
            onClick={showSearchView}
          >
            <Search
              className="nav-item-icon"
              size={menuIconSize}
              strokeWidth={menuIconStrokeWidth}
              aria-hidden="true"
            />
            <span>検索</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={openExportBackupDialog}
          >
            <Download
              className="nav-item-icon"
              size={menuIconSize}
              strokeWidth={menuIconStrokeWidth}
              aria-hidden="true"
            />
            <span>データを保存</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={openImportBackupDialog}
          >
            <Upload
              className="nav-item-icon"
              size={menuIconSize}
              strokeWidth={menuIconStrokeWidth}
              aria-hidden="true"
            />
            <span>データを戻す</span>
          </button>
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept="application/json"
            onChange={handleImportBackup}
          />
          <button className="nav-item nav-help-item" type="button" onClick={openHelp}>
            <CircleQuestionMark
              className="nav-item-icon"
              size={menuIconSize}
              strokeWidth={menuIconStrokeWidth}
              aria-hidden="true"
            />
            <span>使い方</span>
          </button>
          <button
            className={isInformationView ? "nav-item active" : "nav-item"}
            type="button"
            onClick={openSafetyPage}
          >
            <ShieldCheck
              className="nav-item-icon"
              size={menuIconSize}
              strokeWidth={menuIconStrokeWidth}
              aria-hidden="true"
            />
            <span>安全とデータについて</span>
          </button>
        </nav>
        {backupMessage ? <p className="sidebar-note">{backupMessage}</p> : null}
      </aside>

      {operationError ? (
        <div className="operation-error" role="alert">
          <span>{operationError}</span>
          <button type="button" onClick={() => setOperationError("")} aria-label="エラー通知を閉じる">
            閉じる
          </button>
        </div>
      ) : null}

      <main
        className={
          !isLogView
            ? "main-pane summary-pane"
            : hasUnsavedEdit
              ? "main-pane has-edit-save-bar"
              : "main-pane"
        }
      >
        {isInformationView && informationPage ? (
          <InformationScreen
            page={informationPage}
            onBack={goBackFromInformationPage}
            onNavigate={navigateInformationPage}
          />
        ) : isSearchView ? (
          <section className="search-screen" aria-label="メモを検索">
            <div className="search-header">
              <label className="search-field">
                <span>検索</span>
                <input
                  type="search"
                  value={searchQuery}
                  placeholder="メモを検索"
                  onChange={(event) => setSearchQuery(event.target.value)}
                  autoFocus
                />
              </label>
              <button className="search-close-button" type="button" onClick={showLogView} aria-label="検索を閉じる">
                閉じる
              </button>
              <TagFilter
                selectedTags={selectedFilterTags}
                onToggle={toggleFilterTag}
                onClear={() => setSelectedFilterTags([])}
              />
            </div>

            <div className="search-result-list" aria-live="polite">
              {isSearchLoading ? (
                <div className="empty-state">読み込み中...</div>
              ) : searchLoadError ? (
                <div className="empty-state data-error-state" role="alert">
                  {searchLoadError}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="empty-state">
                  {hasSearchQuery || hasFilter
                    ? "検索条件に一致するメモはありません。"
                    : "メモはまだありません。"}
                </div>
              ) : (
                <>
                  <p className="search-section-title">
                    {hasSearchQuery || hasFilter ? `検索結果 ${searchResults.length}件` : "最近"}
                  </p>
                  {searchResults.map((log) => (
                    <button
                      className="search-result-item"
                      type="button"
                      key={log.id}
                      onClick={() => openSearchResult(log)}
                    >
                      <span className="search-result-main">
                        <span className="search-result-title">{log.text || "画像メモ"}</span>
                        {log.tags.length > 0 ? (
                          <span className="search-result-tags">{log.tags.join(" / ")}</span>
                        ) : null}
                      </span>
                      <span className="search-result-date">{formatSearchDateLabel(log.date)}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </section>
        ) : isReviewView ? (
          <section className="review-screen" aria-label="記録を振り返る">
            <header className="review-header">
              <h1>記録を振り返る</h1>
              <div className="review-summary" aria-label="記録の概要">
                <span>これまでの記録 {reviewLogs.length}件</span>
                {reviewLogs.length > 0 ? <span>最近よく使った分類：{Object.entries(reviewLogs.flatMap((log) => log.tags).reduce<Record<string, number>>((counts, tag) => ({ ...counts, [tag]: (counts[tag] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([tag]) => tag).join("・") || "なし"}</span> : null}
              </div>
              <div className="review-period">
                <p aria-label="表示中の期間">
                  {reviewRange ? <>
                      <time dateTime={reviewRange.start}>{formatJapaneseDate(reviewRange.start)}</time>
                      <span aria-hidden="true">〜</span>
                      <time dateTime={reviewRange.end}>{formatJapaneseDate(reviewRange.end)}</time>
                    </> : "最近の記録"}
                </p>
                <button type="button" onClick={openRangePicker}>期間を変更</button>
              </div>
              {reviewRange ? (
                <>
                  <div className="review-filter">
                    <span className="review-filter-label">タグ</span>
                    <div className="review-filter-options" aria-label="振り返りをタグで絞り込み">
                      {reviewTagFilters.map((tagFilter) => {
                        const isSelected = reviewTagFilter === tagFilter;

                        return (
                          <button
                            className={isSelected ? "review-tag-button selected" : "review-tag-button"}
                            type="button"
                            key={tagFilter}
                            onClick={() => selectReviewTagFilter(tagFilter)}
                            aria-pressed={isSelected}
                          >
                            {tagFilter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="review-copy-row">
                    <span>対象 {filteredReviewLogs.length}件</span>
                    <button
                      className="review-copy-button"
                      type="button"
                      onClick={handleCopyReviewForAi}
                      disabled={
                        filteredReviewLogs.length === 0 || isReviewLoading || Boolean(reviewLoadError)
                      }
                    >
                      AI用にコピー
                    </button>
                  </div>
                  {reviewCopyStatus ? (
                    <p
                      className={`review-copy-status ${reviewCopyStatus.kind}`}
                      role={reviewCopyStatus.kind === "error" ? "alert" : "status"}
                    >
                      {reviewCopyStatus.message}
                    </p>
                  ) : null}
                </>
              ) : <p className="review-compact-note">期間を選ぶと、分類で絞り込みやAI用コピーが使えます。</p>}
            </header>

            <div className="review-list" aria-live="polite">
              {isReviewLoading ? (
                <div className="empty-state">読み込み中...</div>
              ) : reviewLoadError ? (
                <div className="empty-state data-error-state" role="alert">
                  {reviewLoadError}
                </div>
              ) : reviewGroups.length === 0 ? (
                <div className="empty-state review-empty-state">
                  <p>
                    {reviewLogs.length === 0
                      ? "この期間の記録はありません"
                      : `この期間の「${reviewTagFilter}」記録はありません`}
                  </p>
                  {reviewLogs.length === 0 ? (
                    <button type="button" onClick={openRangePicker}>
                      期間を変更する
                    </button>
                  ) : (
                    <button type="button" onClick={() => selectReviewTagFilter("すべて")}>
                      すべて表示
                    </button>
                  )}
                </div>
              ) : (
                reviewGroups.map((group) => (
                  <section className="review-day" key={group.date}>
                    <h2>{formatDateHeading(group.date)}</h2>
                    <div className="review-day-logs">
                      {group.logs.map((log) => (
                        <button
                          className="log-entry review-log-item"
                          type="button"
                          key={log.id}
                          onClick={() => openSearchResult(log)}
                          aria-label={`${formatDateHeading(log.date)}の${log.text || "画像メモ"}を日別画面で開く`}
                        >
                          <span className="log-meta">
                            <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
                            {log.tags.length > 0 ? (
                              <span className="tag-list saved-tag-list" aria-label="タグ">
                                {log.tags.map((tag) => (
                                  <span className="tag-chip" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </span>
                          <span className="log-content">
                            <span className="log-body">
                              {log.text ? <span className="review-log-text">{log.text}</span> : null}
                              {log.images.map((image) => (
                                <ImagePreview image={image} key={image.id} variant="review" />
                              ))}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          </section>
        ) : isAiAnalysisView ? (
          <section className="ai-analysis-screen" aria-label="まとめ">
            {aiAnalysisScreen === "list" ? (
              <>
                <header className="ai-analysis-list-header">
                  <div className="ai-analysis-heading-row">
                    <h1>まとめ</h1>
                    <button
                      className="ai-analysis-primary-button"
                      type="button"
                      onClick={openAiAnalysisSaveScreen}
                      autoFocus
                    >
                      <Plus aria-hidden="true" size={17} /> 新しく保存
                    </button>
                  </div>
                  {aiAnalysisNotice ? (
                    <p className="ai-analysis-notice" role="status">
                      {aiAnalysisNotice}
                    </p>
                  ) : null}
                </header>

                <div className="ai-analysis-list" aria-live="polite">
                  {isAiAnalysisLoading ? (
                    <div className="empty-state">読み込み中...</div>
                  ) : aiAnalysisLoadError ? (
                    <div className="empty-state data-error-state" role="alert">
                      {aiAnalysisLoadError}
                    </div>
                  ) : aiAnalyses.length === 0 ? (
                    <div className="empty-state">保存したまとめはまだありません。</div>
                  ) : (
                    aiAnalyses.map((analysis) => (
                      <button
                        className="ai-analysis-list-item"
                        type="button"
                        key={analysis.id}
                        onClick={() => openAiAnalysisDetail(analysis)}
                      >
                        <span className="ai-analysis-list-meta">
                          <span className="ai-analysis-period">
                            <time dateTime={analysis.startDate}>
                              {formatJapaneseDate(analysis.startDate)}
                            </time>
                            <span aria-hidden="true">〜</span>
                            <time dateTime={analysis.endDate}>
                              {formatJapaneseDate(analysis.endDate)}
                            </time>
                          </span>
                          <span className="ai-analysis-tag">{analysis.tag}</span>
                          <time className="ai-analysis-saved-date" dateTime={analysis.createdAt}>
                            保存 {formatSavedDate(analysis.createdAt)}
                          </time>
                        </span>
                        <span className="ai-analysis-excerpt">{extractAnalysisExcerpt(analysis.text)}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : aiAnalysisScreen === "save" ? (
              <div className="ai-analysis-scroll-area">
                <div className="ai-analysis-content">
                  <button
                    className="ai-analysis-back-button"
                    type="button"
                    onClick={showAiAnalysisList}
                    autoFocus
                  >
                    ← 一覧へ戻る
                  </button>
                  <h1>まとめを保存</h1>

                  <form className="ai-analysis-form" onSubmit={handleSaveAiAnalysis}>
                    <fieldset className="ai-analysis-fieldset">
                      <legend>期間</legend>
                      <div className="ai-analysis-date-fields">
                        <label className="ai-analysis-field">
                          <span>開始日</span>
                          <input
                            type="date"
                            value={aiAnalysisStartDate}
                            max={todayKey}
                            onChange={(event) => {
                              setAiAnalysisStartDate(event.target.value);
                              setAiAnalysisFormMessage("");
                            }}
                            required
                          />
                        </label>
                        <label className="ai-analysis-field">
                          <span>終了日</span>
                          <input
                            type="date"
                            value={aiAnalysisEndDate}
                            min={aiAnalysisStartDate}
                            max={todayKey}
                            onChange={(event) => {
                              setAiAnalysisEndDate(event.target.value);
                              setAiAnalysisFormMessage("");
                            }}
                            required
                          />
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="ai-analysis-fieldset">
                      <legend>タグ</legend>
                      <div className="review-filter-options" aria-label="AI分析の対象タグ">
                        {reviewTagFilters.map((tag) => {
                          const isSelected = aiAnalysisTag === tag;

                          return (
                            <button
                              className={isSelected ? "review-tag-button selected" : "review-tag-button"}
                              type="button"
                              key={tag}
                              onClick={() => {
                                setAiAnalysisTag(tag);
                                setAiAnalysisFormMessage("");
                              }}
                              aria-pressed={isSelected}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <label className="ai-analysis-field">
                      <span>まとめの本文</span>
                      <textarea
                        className="ai-analysis-result-input"
                        value={aiAnalysisText}
                        placeholder="外部AIの分析結果を貼り付けてください"
                        onChange={(event) => {
                          setAiAnalysisText(event.target.value);
                          setAiAnalysisFormMessage("");
                        }}
                        required
                      />
                    </label>

                    {aiAnalysisFormMessage ? (
                      <p className="ai-analysis-form-message" role="alert">
                        {aiAnalysisFormMessage}
                      </p>
                    ) : null}

                    <button
                      className="ai-analysis-primary-button ai-analysis-save-button"
                      type="submit"
                      disabled={isSavingAiAnalysis}
                    >
                      {isSavingAiAnalysis ? "保存中" : "保存"}
                    </button>
                  </form>
                </div>
              </div>
            ) : (
              <div className="ai-analysis-scroll-area">
                <div className="ai-analysis-content">
                  <button
                    className="ai-analysis-back-button"
                    type="button"
                    onClick={showAiAnalysisList}
                    autoFocus
                  >
                    ← 一覧へ戻る
                  </button>
                  {selectedAiAnalysis ? (
                    <article className="ai-analysis-detail">
                      <h1>まとめ</h1>
                      <dl className="ai-analysis-detail-meta">
                        <div>
                          <dt>期間</dt>
                          <dd>
                            <time dateTime={selectedAiAnalysis.startDate}>
                              {formatJapaneseDate(selectedAiAnalysis.startDate)}
                            </time>
                            <span aria-hidden="true">〜</span>
                            <time dateTime={selectedAiAnalysis.endDate}>
                              {formatJapaneseDate(selectedAiAnalysis.endDate)}
                            </time>
                          </dd>
                        </div>
                        <div>
                          <dt>タグ</dt>
                          <dd>{selectedAiAnalysis.tag}</dd>
                        </div>
                        <div>
                          <dt>保存日</dt>
                          <dd>
                            <time dateTime={selectedAiAnalysis.createdAt}>
                              {formatSavedDate(selectedAiAnalysis.createdAt)}
                            </time>
                          </dd>
                        </div>
                      </dl>
                      {(() => {
                        const highlights = extractAnalysisHighlights(selectedAiAnalysis.text);
                        return highlights ? <>
                          <section className="analysis-highlights" aria-label="まとめの要点">
                            {highlights.insight ? <div><span>一番の気づき</span><p>{highlights.insight}</p></div> : null}
                            {highlights.nextStep ? <div><span>次に試すこと</span><p>{highlights.nextStep}</p><button type="button" onClick={() => chooseFocus(highlights.nextStep!)}>これを意識する</button>{focusReflectionNotice ? <p className="focus-reflection-notice" aria-live="polite">{focusReflectionNotice}</p> : null}</div> : null}
                          </section>
                          <div className="ai-analysis-detail-body">{selectedAiAnalysis.text}</div>
                        </> : <div className="ai-analysis-detail-body">{selectedAiAnalysis.text}</div>;
                      })()}
                    </article>
                  ) : (
                    <div className="empty-state">AI分析を表示できませんでした。</div>
                  )}
                </div>
              </div>
            )}
          </section>
        ) : (
          <>
        <header className="topbar">
          <div className="topbar-main">
            <p className="eyebrow">{isToday ? "今日の記録" : "過去の記録"}</p>
            <div className="date-navigator" aria-label="日付移動">
              <button
                className="date-nav-button"
                type="button"
                onClick={() => moveSelectedDate(-1)}
                aria-label="前日へ移動"
              >
                ＜
              </button>
              <h1>
                {formatDisplayDate(selectedDate)}
              </h1>
              <button
                className="date-nav-button"
                type="button"
                onClick={() => moveSelectedDate(1)}
                aria-label="翌日へ移動"
                disabled={isToday}
              >
                ＞
              </button>
            </div>
          </div>
          <span className="log-count">{logs.length}件</span>
        </header>

        <section className="log-list" aria-live="polite" tabIndex={-1}>
          {isToday && primaryFocus ? (
            <section className="primary-focus" aria-label="今、一番意識していること">
              <span>今、一番意識していること</span>
              <p>{primaryFocus}</p>
            </section>
          ) : null}
          {showInlineEditHint && logs.length > 0 && !isLoading && !logLoadError ? (
            <div className="inline-edit-hint" role="status">
              <span>メモをタップすると編集できます</span>
              <button
                type="button"
                onClick={dismissInlineEditHint}
                aria-label="メモ編集の案内を閉じる"
              >
                閉じる
              </button>
            </div>
          ) : null}
          {isLoading ? (
            <div className="empty-state">読み込み中...</div>
          ) : logLoadError ? (
            <div className="empty-state data-error-state" role="alert">
              {logLoadError}
            </div>
          ) : logs.length === 0 ? (
            <div className="empty-state">{emptyMessage}</div>
          ) : (
            logs.map((log) => {
              const isEditing = editingLogId === log.id;
              const isSavingEdit = savingEditLogId === log.id;
              const visibleText = isEditing ? editingText : log.text;
              const visibleTags = isEditing ? editingTags : log.tags;

              return (
                <article
                  className={highlightedLogId === log.id ? "log-entry highlighted" : "log-entry"}
                  data-log-id={log.id}
                  key={log.id}
                  tabIndex={-1}
                >
                  <div className="log-meta">
                    <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
                    {visibleTags.length > 0 ? (
                      <div className="tag-list saved-tag-list" aria-label="タグ">
                        {visibleTags.map((tag) => (
                          <span className="tag-chip" key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="log-content">
                    {isEditing && editingMessage ? (
                      <p className="edit-message" role="alert">
                        {editingMessage}
                      </p>
                    ) : null}
                    <div className={isEditing ? "log-body editing" : "log-body"}>
                      {isEditing ? (
                        <textarea
                          ref={(textarea) => {
                            if (!textarea) {
                              return;
                            }

                            resizeTextarea(textarea);
                            editingTextareaRef.current = textarea;
                          }}
                          className="inline-edit-textarea editing"
                          aria-label={`${formatTime(log.createdAt)}のメモを編集中`}
                          rows={1}
                          value={visibleText}
                          placeholder="本文を入力"
                          onChange={(event) => {
                            setEditingText(event.target.value);
                            resizeTextarea(event.currentTarget);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              cancelEditingLog();
                              return;
                            }

                            if (
                              event.key === "Enter" &&
                              (event.metaKey || event.ctrlKey) &&
                              hasUnsavedEdit &&
                              !isSavingEdit
                            ) {
                              event.preventDefault();
                              handleUpdateLog(log);
                            }
                          }}
                        />
                      ) : (
                        <button
                          className="inline-edit-trigger"
                          type="button"
                          aria-label={`${formatTime(log.createdAt)}のメモ。タップまたはキーボードで編集`}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }

                            event.preventDefault();
                            pendingCaretRef.current = {
                              logId: log.id,
                              start: log.text.length,
                              end: log.text.length,
                            };

                            if (!startEditingLog(log)) {
                              pendingCaretRef.current = null;
                            }
                          }}
                          onClick={(event) => {
                            const caretOffset =
                              event.detail > 0
                                ? getTextOffsetAtPoint(
                                    event.currentTarget,
                                    event.clientX,
                                    event.clientY,
                                    log.text.length,
                                  )
                                : log.text.length;

                            pendingCaretRef.current = {
                              logId: log.id,
                              start: caretOffset,
                              end: caretOffset,
                            };

                            if (!startEditingLog(log)) {
                              pendingCaretRef.current = null;
                            }
                          }}
                        >
                          <span>{log.text || "画像メモを編集"}</span>
                        </button>
                      )}
                      {log.images.map((image) => (
                        <ImagePreview image={image} key={image.id} />
                      ))}
                    </div>
                    {isEditing ? (
                      <div className="inline-edit-options">
                        <span className="inline-edit-label">タグ</span>
                        <div className="tag-list edit-tag-list" aria-label="タグを編集">
                          {logTags.map((tag) => {
                            const isSelected = editingTags.includes(tag);

                            return (
                              <button
                                className={isSelected ? "tag-toggle selected" : "tag-toggle"}
                                type="button"
                                key={tag}
                                onClick={() => toggleEditingTag(tag)}
                                aria-pressed={isSelected}
                                disabled={isSavingEdit}
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                        <button
                          className="inline-delete-button"
                          type="button"
                          onClick={() => handleDeleteLog(log.id)}
                          disabled={isSavingEdit}
                        >
                          このメモを削除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </section>

        {editingLog && hasUnsavedEdit ? (
          <div className="edit-save-bar" role="region" aria-label="メモの変更を保存">
            <span className="edit-save-status" aria-live="polite">
              変更があります
            </span>
            <div className="edit-save-actions">
              <button
                className="edit-save-cancel"
                type="button"
                onClick={() => cancelEditingLog()}
                disabled={savingEditLogId === editingLog.id}
                aria-label="メモの変更をキャンセル"
              >
                キャンセル
              </button>
              <button
                className="edit-save-submit"
                type="button"
                onClick={() => handleUpdateLog(editingLog)}
                disabled={savingEditLogId === editingLog.id}
                aria-label="メモの変更を保存"
              >
                {savingEditLogId === editingLog.id ? "保存中" : "保存"}
              </button>
            </div>
          </div>
        ) : null}

        <form className="composer" onSubmit={handleSubmit}>
          <h2 className="composer-title">今の気づきを残す</h2>
          <div className="draft-status">
            <p role={draftState.error ? "alert" : "status"}>
              {draftState.error || (!draftState.ready ? "書きかけを確認しています…" : draftState.pending ? "書きかけを自動保存中…" : draftState.notice || (hasNewDraft ? "書きかけを自動保存しました。" : "書きかけは自動保存されます。"))}
            </p>
            {hasNewDraft ? <span>書きかけの日付：{formatDisplayDate(draftDate)}</span> : null}
            {draftState.error ? <button type="button" disabled={draftState.busy || isSaving} onClick={() => {
              if (draftState.ready) draft.retry();
              else void draft.start().then(() => {
                if (draft.getSnapshot().ready) setSelectedDate(draft.getSnapshot().content.date);
              });
            }}>再試行</button> : null}
            {hasNewDraft && !isDiscardConfirmOpen ? <button type="button" onClick={() => setIsDiscardConfirmOpen(true)} disabled={composerDisabled || isSaving || isPreparingImage}>書きかけを破棄</button> : null}
            {isDiscardConfirmOpen ? (
              <div className="draft-discard-confirm" role="group" aria-label="書きかけの破棄を確認">
                <p role="alert">この書きかけを破棄しますか？本文・タグ・添付画像が消えます。保存済みの記録は消えません。</p>
                <button type="button" onClick={() => setIsDiscardConfirmOpen(false)} disabled={draftState.busy} autoFocus>残す</button>
                <button type="button" onClick={() => void discardNewDraft()} disabled={draftState.busy}>破棄する</button>
              </div>
            ) : null}
            <details onToggle={(event) => { if (event.currentTarget.open) void draft.refresh(); }}>
              <summary>ほかの書きかけを確認</summary>
              {draftState.alternatives.length ? draftState.alternatives.map((row) => (
                <button type="button" key={row.id} disabled={composerDisabled || isSaving || isPreparingImage} onClick={() => void draft.open(row.id).then(() => setSelectedDate(draft.getSnapshot().content.date))}>
                  {row.content ? formatDisplayDate(row.content.date) : ""}：{row.content?.text.slice(0, 30) || "タグ・画像の書きかけ"}
                </button>
              )) : <span>ほかの書きかけはありません。</span>}
            </details>
          </div>
          {submitMessage ? <p className="composer-message">{submitMessage}</p> : null}
          {composerGuideStep === "tags" ? (
            <div className="composer-guide" role="region" aria-label="タグの入力案内">
              <span aria-live="polite">まず、タグを選びます。選ばなくても大丈夫です。</span>
              <button type="button" onClick={() => setComposerGuideStep("text")}>
                次へ
              </button>
            </div>
          ) : null}
          <details className="composer-tags" ref={composerTagsRef}>
            <summary>分類を追加{selectedTags.length ? `（${selectedTags.join("・")}）` : ""}</summary>
          <div className="tag-picker" aria-label="分類を選択">
            {logTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);

              return (
                <button
                  className={isSelected ? "tag-toggle selected" : "tag-toggle"}
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  disabled={composerDisabled}
                  aria-pressed={isSelected}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          </details>
          {pendingImage ? (
            <div className="attachment-preview">
              {pendingImageUrl ? <img alt={pendingImage.name} src={pendingImageUrl} /> : null}
              <span>{pendingImage.name}</span>
              <button type="button" onClick={clearPendingImage} disabled={composerDisabled || isPreparingImage}>
                削除
              </button>
            </div>
          ) : null}
          <input
            ref={imageInputRef}
            className="file-input"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            disabled={composerDisabled || isPreparingImage || isSaving}
          />
          {composerGuideStep === "text" ? (
            <div className="composer-guide composer-text-guide" role="status">
              ここに今日の感覚や気づいたことを書きます。
            </div>
          ) : null}
          <button
            className="attach-button"
            type="button"
            onClick={() => imageInputRef.current?.click()}
            aria-label="画像を追加"
            disabled={composerDisabled || isPreparingImage || isSaving}
          >
            画像を追加
          </button>
          <textarea
            ref={composerTextareaRef}
            aria-label="メモ"
            placeholder="例: 外角を逆方向へ押せた"
            rows={3}
            value={text}
            onFocus={() => setComposerGuideStep(null)}
            onChange={(event) => { updateNewDraft({ text: event.target.value }); resizeTextarea(event.currentTarget); }}
            disabled={composerDisabled}
          />
          <button className="send-button" type="submit" disabled={!canSubmit}>
            {isSaving ? "保存中" : "保存"}
          </button>
        </form>
          </>
        )}
      </main>
      <nav className="bottom-navigation" aria-label="主な画面">
        <button className={isLogView ? "active" : ""} type="button" onClick={showTodayView}>
          <Home aria-hidden="true" size={20} /><span>記録</span>
        </button>
        <button className={isReviewView ? "active" : ""} type="button" onClick={showRecordReview}>
          <BookOpen aria-hidden="true" size={20} /><span>振り返り</span>
        </button>
        <button className={isAiAnalysisView ? "active" : ""} type="button" onClick={showAiAnalysisView}>
          <FileText aria-hidden="true" size={20} /><span>まとめ</span>
        </button>
        <button className={isMenuOpen ? "active" : ""} type="button" onClick={() => setIsMenuOpen((open) => !open)} aria-expanded={isMenuOpen}>
          <MoreHorizontal aria-hidden="true" size={20} /><span>その他</span>
        </button>
      </nav>
      {isRangePickerOpen ? (
        <RecordReviewCalendar
          currentRange={reviewRange}
          maxDate={todayKey}
          onApply={applyReviewRange}
          onCancel={() => setIsRangePickerOpen(false)}
        />
      ) : null}
      {backupDialogMode ? (
        <BackupDialog
          mode={backupDialogMode}
          summary={backupSummary}
          lastBackupAt={lastBackupAt}
          onConfirm={
            backupDialogMode === "export" ? handleExportBackup : selectBackupFile
          }
          onCancel={() => setBackupDialogMode(null)}
        />
      ) : null}
      {onboardingMode ? (
        <OnboardingDialog
          mode={onboardingMode}
          onStart={startOnboardingGuide}
          onDismiss={dismissOnboarding}
          onClose={() => setOnboardingMode(null)}
          onOpenSafety={openSafetyFromOnboarding}
        />
      ) : null}
    </div>
  );
}

export default App;
