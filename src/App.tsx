import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  BackupValidationError,
  validateBackup,
  type BackupLogEntry,
} from "./backup";
import { getDataWriteErrorMessage } from "./dataError";
import { db } from "./db";
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
import { RecordReviewCalendar, type DateRange } from "./RecordReviewCalendar";
import type { LogEntry, LogImage, LogTag } from "./types";

const todayKey = toDateKey(new Date());
const logTags: LogTag[] = ["打撃", "守備", "走塁", "投球", "体調", "フィジカル"];
const maxImageSize = 1400;
const imageQuality = 0.82;
const inlineEditHintStorageKey = "baseball-note-inline-edit-hint-dismissed";
const reviewRangeStorageKey = "baseball-note-record-review-range";

type StoredLogEntry = Omit<LogEntry, "images" | "tags"> &
  Partial<Pick<LogEntry, "images" | "tags">>;

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

function App() {
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchLogs, setSearchLogs] = useState<LogEntry[]>([]);
  const [reviewLogs, setReviewLogs] = useState<LogEntry[]>([]);
  const [reviewRange, setReviewRange] = useState<DateRange | null>(loadSavedReviewRange);
  const [isRangePickerOpen, setIsRangePickerOpen] = useState(false);
  const [text, setText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<LogTag[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<LogTag[]>([]);
  const [pendingImage, setPendingImage] = useState<LogImage | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [logLoadError, setLogLoadError] = useState("");
  const [searchLoadError, setSearchLoadError] = useState("");
  const [reviewLoadError, setReviewLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [viewMode, setViewMode] = useState<"logs" | "search" | "review">("logs");
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingTags, setEditingTags] = useState<LogTag[]>([]);
  const [editingMessage, setEditingMessage] = useState("");
  const [savingEditLogId, setSavingEditLogId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showInlineEditHint, setShowInlineEditHint] = useState(() => {
    try {
      return window.localStorage.getItem(inlineEditHintStorageKey) !== "1";
    } catch {
      return true;
    }
  });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaretRef = useRef<{ logId: string; start: number; end: number } | null>(null);

  const isToday = selectedDate === todayKey;
  const trimmedText = text.trim();
  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  const isLogView = viewMode === "logs";
  const isSearchView = viewMode === "search";
  const isReviewView = viewMode === "review";
  const hasSearchQuery = trimmedSearchQuery.length > 0;
  const canSubmit = Boolean(trimmedText || pendingImage) && !isSaving;
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
  const reviewGroups = useMemo(() => {
    const groups = new Map<string, LogEntry[]>();

    for (const log of reviewLogs) {
      const dayLogs = groups.get(log.date) ?? [];
      dayLogs.push(log);
      groups.set(log.date, dayLogs);
    }

    return Array.from(groups, ([date, dayLogs]) => ({ date, logs: dayLogs }));
  }, [reviewLogs]);

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
    if (!hasUnsavedEdit) {
      return;
    }

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedEdit]);

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

  function closeMenu() {
    setIsMenuOpen(false);
  }

  function showLogView() {
    setViewMode("logs");
    setSearchQuery("");
  }

  function showSearchView() {
    if (!prepareToLeaveEditing()) {
      closeMenu();
      return;
    }

    setViewMode("search");
    setSearchQuery("");
    closeMenu();
  }

  function showRecordReview() {
    setIsRangePickerOpen(true);
    closeMenu();
  }

  function openRangePicker() {
    setIsRangePickerOpen(true);
  }

  function applyReviewRange(range: DateRange) {
    if (!prepareToLeaveEditing()) {
      setIsRangePickerOpen(false);
      return;
    }

    setReviewRange(range);
    saveReviewRange(range);
    setViewMode("review");
    setIsRangePickerOpen(false);
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
      if (!isReviewView || !reviewRange) {
        setReviewLogs([]);
        setReviewLoadError("");
        setIsReviewLoading(false);
        return;
      }

      setIsReviewLoading(true);
      setReviewLoadError("");

      try {
        const entries = await db.logs
          .where("date")
          .between(reviewRange.start, reviewRange.end, true, true)
          .toArray();

        if (isActive) {
          setReviewLogs(sortLogsByDate(entries));
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

  const emptyMessage = useMemo(() => {
    if (isToday) {
      return "今日の感覚を短く書いて送信します。";
    }

    return "この日のログはまだありません。";
  }, [isToday]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    setIsSaving(true);
    setSubmitMessage("");

    const now = new Date();
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      date: selectedDate,
      createdAt: now.toISOString(),
      text: trimmedText,
      tags: selectedTags,
      images: pendingImage ? [pendingImage] : [],
    };

    try {
      await db.logs.add(entry);
      setLogs((currentLogs) => [...currentLogs, entry]);
      setText("");
      setSelectedTags([]);
      setPendingImage(null);
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    } catch (error) {
      setSubmitMessage(
        `${getDataWriteErrorMessage(
          error,
          "メモを保存できませんでした。もう一度試してください。",
        )} 入力内容は残っています。`,
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setSubmitMessage("画像を準備しています。");

    try {
      setPendingImage(await prepareImage(file));
      setSubmitMessage("");
    } catch {
      setPendingImage(null);
      setSubmitMessage("画像を読み込めませんでした。別の画像で試してください。");
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  }

  function clearPendingImage() {
    setPendingImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function toggleTag(tag: LogTag) {
    setSelectedTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
  }

  function toggleFilterTag(tag: LogTag) {
    setSelectedFilterTags((currentTags) =>
      currentTags.includes(tag)
        ? currentTags.filter((currentTag) => currentTag !== tag)
        : [...currentTags, tag],
    );
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

  async function handleExportBackup() {
    setOperationError("");
    let url = "";

    try {
      const allLogs = await db.logs.orderBy("createdAt").toArray();
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

      const blob = new Blob([JSON.stringify({ version: 1, logs: backupLogs }, null, 2)], {
        type: "application/json",
      });
      url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `baseball-note-backup-${todayKey}.json`;
      link.click();
      setBackupMessage(`${allLogs.length}件を書き出しました。`);
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
      const { logs: backupLogs } = validateBackup(parsed);
      const existingLogs = await db.logs.bulkGet(backupLogs.map((log) => log.id));
      const overwriteCount = existingLogs.filter((log) => log !== undefined).length;
      const newCount = backupLogs.length - overwriteCount;

      if (backupLogs.length === 0) {
        setBackupMessage("このバックアップに読み込めるメモはありません。既存データは変更していません。");
        return;
      }

      const shouldImport = window.confirm(
        `${backupLogs.length}件を読み込みます。\n新規: ${newCount}件\n上書き: ${overwriteCount}件\n\n` +
          "同じIDのメモは上書きされます。読み込みを続けますか？",
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

      await db.transaction("rw", db.logs, async () => {
        await db.logs.bulkPut(restoredLogs);
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
      setBackupMessage(
        `${restoredLogs.length}件を読み込みました（新規${newCount}件、上書き${overwriteCount}件）。`,
      );
    } catch (error) {
      if (importWasApplied) {
        const message =
          "メモは読み込めましたが、画面を更新できませんでした。アプリを開き直してください。";
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
        <span className="mobile-brand-title">Baseball Note</span>
        {isLogView ? (
          <>
            <h1 className="mobile-context-heading">{isToday ? "今日のログ" : "過去のログ"}</h1>
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
          <div className="brand">
            <span className="brand-mark">B</span>
            <span>Baseball Note</span>
          </div>
          <button className="menu-close-button" type="button" onClick={closeMenu} aria-label="メニューを閉じる">
            閉じる
          </button>
        </div>

        <nav className="nav-list">
          <button
            className={isLogView && isToday ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => {
              if (!prepareToLeaveEditing()) {
                closeMenu();
                return;
              }

              setSelectedDate(todayKey);
              showLogView();
              closeMenu();
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ○
            </span>
            <span>今日</span>
          </button>
          <label className="date-picker">
            <span className="date-picker-label">
              <span className="nav-icon" aria-hidden="true">
                □
              </span>
              <span>日付</span>
            </span>
            <input
              type="date"
              value={selectedDate}
              max={todayKey}
              onChange={(event) => {
                if (event.target.value > todayKey) {
                  return;
                }

                if (!prepareToLeaveEditing()) {
                  closeMenu();
                  return;
                }

                setSelectedDate(event.target.value);
                showLogView();
                closeMenu();
              }}
            />
          </label>
          <button
            className={isReviewView ? "nav-item active" : "nav-item"}
            type="button"
            onClick={showRecordReview}
          >
            <span className="nav-icon" aria-hidden="true">
              振
            </span>
            <span>記録を振り返る</span>
          </button>
          <button
            className={isSearchView ? "nav-item active" : "nav-item"}
            type="button"
            onClick={showSearchView}
          >
            <span className="nav-icon" aria-hidden="true">
              ⌕
            </span>
            <span>検索</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              handleExportBackup();
              closeMenu();
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ↓
            </span>
            <span>バックアップ</span>
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              if (!prepareToLeaveEditing()) {
                closeMenu();
                return;
              }

              importInputRef.current?.click();
              closeMenu();
            }}
          >
            <span className="nav-icon" aria-hidden="true">
              ↑
            </span>
            <span>読み込み</span>
          </button>
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept="application/json"
            onChange={handleImportBackup}
          />
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
        {isSearchView ? (
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
              {reviewRange ? (
                <div className="review-period">
                  <p aria-label="表示中の期間">
                    <time dateTime={reviewRange.start}>{formatJapaneseDate(reviewRange.start)}</time>
                    <span aria-hidden="true">〜</span>
                    <time dateTime={reviewRange.end}>{formatJapaneseDate(reviewRange.end)}</time>
                  </p>
                  <button type="button" onClick={openRangePicker}>
                    期間を変更
                  </button>
                </div>
              ) : null}
            </header>

            <div className="review-list" aria-live="polite">
              {!reviewRange ? null : isReviewLoading ? (
                <div className="empty-state">読み込み中...</div>
              ) : reviewLoadError ? (
                <div className="empty-state data-error-state" role="alert">
                  {reviewLoadError}
                </div>
              ) : reviewGroups.length === 0 ? (
                <div className="empty-state review-empty-state">
                  <p>この期間の記録はありません</p>
                  <button type="button" onClick={openRangePicker}>
                    期間を変更する
                  </button>
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
        ) : (
          <>
        <header className="topbar">
          <div className="topbar-main">
            <p className="eyebrow">{isToday ? "今日のログ" : "過去のログ"}</p>
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
          {submitMessage ? <p className="composer-message">{submitMessage}</p> : null}
          <div className="tag-picker" aria-label="タグを選択">
            {logTags.map((tag) => {
              const isSelected = selectedTags.includes(tag);

              return (
                <button
                  className={isSelected ? "tag-toggle selected" : "tag-toggle"}
                  type="button"
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={isSelected}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {pendingImage ? (
            <div className="attachment-preview">
              {pendingImageUrl ? <img alt={pendingImage.name} src={pendingImageUrl} /> : null}
              <span>{pendingImage.name}</span>
              <button type="button" onClick={clearPendingImage}>
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
          />
          <button
            className="attach-button"
            type="button"
            onClick={() => imageInputRef.current?.click()}
            aria-label="画像を添付"
          >
            画像
          </button>
          <textarea
            aria-label="メモ"
            placeholder="例: 外角を逆方向へ押せた"
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <button className="send-button" type="submit" disabled={!canSubmit}>
            {isSaving ? "保存中" : "送信"}
          </button>
        </form>
          </>
        )}
      </main>
      {isRangePickerOpen ? (
        <RecordReviewCalendar
          currentRange={reviewRange}
          maxDate={todayKey}
          onApply={applyReviewRange}
          onCancel={() => setIsRangePickerOpen(false)}
        />
      ) : null}
    </div>
  );
}

export default App;
