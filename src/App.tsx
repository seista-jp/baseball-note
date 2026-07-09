import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { db } from "./db";
import { formatDisplayDate, formatTime, offsetDateKey, toDateKey } from "./date";
import type { LogEntry, LogImage, LogTag } from "./types";

const todayKey = toDateKey(new Date());
const logTags: LogTag[] = ["打撃", "守備", "走塁", "投球", "体調", "フィジカル"];
const maxImageSize = 1400;
const imageQuality = 0.82;

type BackupImage = Omit<LogImage, "blob"> & {
  dataUrl: string;
};

type BackupLogEntry = Omit<LogEntry, "images"> & {
  images: BackupImage[];
};

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

function ImagePreview({ image }: { image: LogImage }) {
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
    <figure className="log-image">
      <img alt={image.name} src={url} />
    </figure>
  );
}

function App() {
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchLogs, setSearchLogs] = useState<LogEntry[]>([]);
  const [text, setText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<LogTag[]>([]);
  const [selectedFilterTags, setSelectedFilterTags] = useState<LogTag[]>([]);
  const [pendingImage, setPendingImage] = useState<LogImage | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [viewMode, setViewMode] = useState<"logs" | "search">("logs");
  const [highlightedLogId, setHighlightedLogId] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingTags, setEditingTags] = useState<LogTag[]>([]);
  const [editingMessage, setEditingMessage] = useState("");
  const [savingEditLogId, setSavingEditLogId] = useState<string | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isToday = selectedDate === todayKey;
  const trimmedText = text.trim();
  const trimmedSearchQuery = searchQuery.trim();
  const normalizedSearchQuery = trimmedSearchQuery.toLowerCase();
  const isSearchView = viewMode === "search";
  const hasSearchQuery = trimmedSearchQuery.length > 0;
  const canSubmit = Boolean(trimmedText || pendingImage) && !isSaving;
  const hasFilter = selectedFilterTags.length > 0;
  const searchResults = useMemo(() => {
    if (!hasSearchQuery) {
      return searchLogs.slice(0, 20);
    }

    return searchLogs.filter((log) => {
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
  }, [hasSearchQuery, normalizedSearchQuery, searchLogs]);
  const baseLogs = logs;
  const filteredLogs = useMemo(() => {
    if (!hasFilter) {
      return baseLogs;
    }

    return baseLogs.filter((log) =>
      selectedFilterTags.some((selectedFilterTag) => log.tags.includes(selectedFilterTag)),
    );
  }, [baseLogs, hasFilter, selectedFilterTags]);
  const displayedLogCount = filteredLogs.length;
  const baseLogCount = baseLogs.length;

  function closeMenu() {
    setIsMenuOpen(false);
  }

  function showLogView() {
    setViewMode("logs");
    setSearchQuery("");
  }

  function showSearchView() {
    setViewMode("search");
    setSearchQuery("");
    closeMenu();
  }

  function openSearchResult(log: LogEntry) {
    setSelectedDate(log.date);
    setHighlightedLogId(log.id);
    showLogView();
  }

  function moveSelectedDate(offsetDays: number) {
    setSelectedDate((currentDate) => offsetDateKey(currentDate, offsetDays));
  }

  useEffect(() => {
    let isActive = true;

    async function loadLogs() {
      setIsLoading(true);
      const entries = await db.logs
        .where("date")
        .equals(selectedDate)
        .sortBy("createdAt");

      if (isActive) {
        setLogs(entries.map(normalizeLog));
        setIsLoading(false);
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
        setIsSearchLoading(false);
        return;
      }

      setIsSearchLoading(true);
      const entries = await db.logs.orderBy("createdAt").toArray();

      if (isActive) {
        setSearchLogs(entries.map(normalizeLog).reverse());
        setIsSearchLoading(false);
      }
    }

    loadSearchLogs();

    return () => {
      isActive = false;
    };
  }, [isSearchView]);

  useEffect(() => {
    if (!highlightedLogId || isLoading || isSearchView) {
      return;
    }

    const highlightedElement = document.querySelector(`[data-log-id="${highlightedLogId}"]`);
    highlightedElement?.scrollIntoView({ block: "center" });

    const timeoutId = window.setTimeout(() => {
      setHighlightedLogId(null);
    }, 2400);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedLogId, isLoading, isSearchView, logs]);

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
    } catch {
      setSubmitMessage("保存できませんでした。画像を小さくするか、もう一度試してください。");
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

  function startEditingLog(log: LogEntry) {
    setEditingLogId(log.id);
    setEditingText(log.text);
    setEditingTags(log.tags);
    setEditingMessage("");
  }

  function cancelEditingLog() {
    setEditingLogId(null);
    setEditingText("");
    setEditingTags([]);
    setEditingMessage("");
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

    if (!nextText && log.images.length === 0) {
      setEditingMessage("本文が空のメモは保存できません。");
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
      cancelEditingLog();
    } catch {
      setEditingMessage("更新できませんでした。もう一度試してください。");
    } finally {
      setSavingEditLogId(null);
    }
  }

  async function handleDeleteLog(logId: string) {
    const shouldDelete = window.confirm("このメモを削除しますか？");

    if (!shouldDelete) {
      return;
    }

    await db.logs.delete(logId);
    setLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
    setSearchLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
  }

  async function handleExportBackup() {
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
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `baseball-note-backup-${todayKey}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setBackupMessage(`${allLogs.length}件を書き出しました。`);
  }

  async function handleImportBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as { logs?: BackupLogEntry[] };
      const backupLogs = Array.isArray(parsed.logs) ? parsed.logs : [];
      const restoredLogs: LogEntry[] = await Promise.all(
        backupLogs.map(async (log) => ({
          id: log.id,
          date: log.date,
          createdAt: log.createdAt,
          text: log.text,
          tags: log.tags ?? [],
          images: await Promise.all(
            (log.images ?? []).slice(0, 1).map(async (image) => ({
              id: image.id,
              name: image.name,
              type: image.type,
              createdAt: image.createdAt,
              blob: await dataUrlToBlob(image.dataUrl),
            })),
          ),
        })),
      );

      await db.logs.bulkPut(restoredLogs);
      const entries = await db.logs.where("date").equals(selectedDate).sortBy("createdAt");
      setLogs(entries.map(normalizeLog));
      if (isSearchView) {
        const allEntries = await db.logs.orderBy("createdAt").toArray();
        setSearchLogs(allEntries.map(normalizeLog).reverse());
      }
      setBackupMessage(`${restoredLogs.length}件を読み込みました。`);
    } catch {
      setBackupMessage("バックアップを読み込めませんでした。");
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
        <div className="brand">
          <span className="brand-mark">B</span>
          <span>Baseball Note</span>
        </div>
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
            className={!isSearchView && isToday ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => {
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
              onChange={(event) => {
                setSelectedDate(event.target.value);
                showLogView();
                closeMenu();
              }}
            />
          </label>
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

      <main className={isSearchView ? "main-pane search-pane" : "main-pane"}>
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
            </div>

            <div className="search-result-list" aria-live="polite">
              {isSearchLoading ? (
                <div className="empty-state">読み込み中...</div>
              ) : searchResults.length === 0 ? (
                <div className="empty-state">
                  {hasSearchQuery ? "検索に一致するメモはありません。" : "メモはまだありません。"}
                </div>
              ) : (
                <>
                  <p className="search-section-title">{hasSearchQuery ? "検索結果" : "最近"}</p>
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
        ) : (
          <>
        <header className="topbar">
          <div>
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
              <h1>{formatDisplayDate(selectedDate)}</h1>
              <button
                className="date-nav-button"
                type="button"
                onClick={() => moveSelectedDate(1)}
                aria-label="翌日へ移動"
              >
                ＞
              </button>
            </div>
          </div>
          <span className="log-count">
            {hasFilter && baseLogCount > 0 ? `${displayedLogCount}/${baseLogCount}件` : `${baseLogCount}件`}
          </span>
        </header>

        <section className="filter-bar" aria-label="タグで絞り込み">
          <span className="filter-label">タグ絞り込み</span>
          <div className="filter-tags">
            {logTags.map((tag) => {
              const isSelected = selectedFilterTags.includes(tag);

              return (
                <button
                  className={isSelected ? "tag-toggle selected" : "tag-toggle"}
                  type="button"
                  key={tag}
                  onClick={() => toggleFilterTag(tag)}
                  aria-pressed={isSelected}
                >
                  {tag}
                </button>
              );
            })}
          </div>
          {hasFilter ? (
            <button className="filter-clear-button" type="button" onClick={() => setSelectedFilterTags([])}>
              解除
            </button>
          ) : null}
        </section>

        <section className="log-list" aria-live="polite">
          {isLoading ? (
            <div className="empty-state">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">{emptyMessage}</div>
          ) : filteredLogs.length === 0 ? (
            <div className="empty-state">選んだタグのメモはありません。</div>
          ) : (
            filteredLogs.map((log) => {
              const isEditing = editingLogId === log.id;
              const isSavingEdit = savingEditLogId === log.id;
              const canSaveEdit = Boolean(editingText.trim() || log.images.length > 0) && !isSavingEdit;

              return (
                <article
                  className={highlightedLogId === log.id ? "log-entry highlighted" : "log-entry"}
                  data-log-id={log.id}
                  key={log.id}
                >
                  <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
                  <div className="log-content">
                    {isEditing ? (
                      <div className="edit-panel">
                        {editingMessage ? <p className="edit-message">{editingMessage}</p> : null}
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
                              >
                                {tag}
                              </button>
                            );
                          })}
                        </div>
                        <textarea
                          className="edit-textarea"
                          aria-label={`${formatTime(log.createdAt)}のメモを編集`}
                          rows={3}
                          value={editingText}
                          onChange={(event) => setEditingText(event.target.value)}
                        />
                        {log.images.map((image) => (
                          <ImagePreview image={image} key={image.id} />
                        ))}
                        <div className="edit-actions">
                          <button
                            className="log-action-button"
                            type="button"
                            onClick={cancelEditingLog}
                            disabled={isSavingEdit}
                          >
                            キャンセル
                          </button>
                          <button
                            className="log-action-button primary"
                            type="button"
                            onClick={() => handleUpdateLog(log)}
                            disabled={!canSaveEdit}
                          >
                            {isSavingEdit ? "保存中" : "保存"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="log-body">
                          {log.tags.length > 0 ? (
                            <div className="tag-list" aria-label="タグ">
                              {log.tags.map((tag) => (
                                <span className="tag-chip" key={tag}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {log.text ? <p>{log.text}</p> : null}
                          {log.images.map((image) => (
                            <ImagePreview image={image} key={image.id} />
                          ))}
                        </div>
                        <div className="log-actions">
                          <button
                            className="log-action-button"
                            type="button"
                            onClick={() => startEditingLog(log)}
                            aria-label={`${formatTime(log.createdAt)}のメモを編集`}
                          >
                            編集
                          </button>
                          <button
                            className="log-action-button danger"
                            type="button"
                            onClick={() => handleDeleteLog(log.id)}
                            aria-label={`${formatTime(log.createdAt)}のメモを削除`}
                          >
                            削除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })
          )}
        </section>

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
    </div>
  );
}

export default App;
