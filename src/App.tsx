import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { db } from "./db";
import { formatDisplayDate, formatTime, toDateKey } from "./date";
import type { LogEntry, LogImage, LogTag } from "./types";

const todayKey = toDateKey(new Date());
const logTags: LogTag[] = ["打撃", "守備", "走塁", "投球", "体調"];

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

function normalizeLog(log: StoredLogEntry): LogEntry {
  return {
    ...log,
    tags: log.tags ?? [],
    images: log.images ?? [],
  };
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
  const [text, setText] = useState("");
  const [selectedTags, setSelectedTags] = useState<LogTag[]>([]);
  const [pendingImage, setPendingImage] = useState<LogImage | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [backupMessage, setBackupMessage] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isToday = selectedDate === todayKey;
  const trimmedText = text.trim();
  const canSubmit = Boolean(trimmedText || pendingImage) && !isSaving;

  function closeMenu() {
    setIsMenuOpen(false);
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

  function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setPendingImage({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      blob: file,
      createdAt: new Date().toISOString(),
    });
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

  async function handleDeleteLog(logId: string) {
    const shouldDelete = window.confirm("このメモを削除しますか？");

    if (!shouldDelete) {
      return;
    }

    await db.logs.delete(logId);
    setLogs((currentLogs) => currentLogs.filter((log) => log.id !== logId));
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
            className={isToday ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => {
              setSelectedDate(todayKey);
              closeMenu();
            }}
          >
            今日
          </button>
          <label className="date-picker">
            <span>日付</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                closeMenu();
              }}
            />
          </label>
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              handleExportBackup();
              closeMenu();
            }}
          >
            バックアップ
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => {
              importInputRef.current?.click();
              closeMenu();
            }}
          >
            読み込み
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

      <main className="main-pane">
        <header className="topbar">
          <div>
            <p className="eyebrow">{isToday ? "今日のログ" : "過去のログ"}</p>
            <h1>{formatDisplayDate(selectedDate)}</h1>
          </div>
          <span className="log-count">{logs.length}件</span>
        </header>

        <section className="log-list" aria-live="polite">
          {isLoading ? (
            <div className="empty-state">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="empty-state">{emptyMessage}</div>
          ) : (
            logs.map((log) => (
              <article className="log-entry" key={log.id}>
                <time dateTime={log.createdAt}>{formatTime(log.createdAt)}</time>
                <div className="log-content">
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
                  <button
                    className="delete-log-button"
                    type="button"
                    onClick={() => handleDeleteLog(log.id)}
                    aria-label={`${formatTime(log.createdAt)}のメモを削除`}
                  >
                    削除
                  </button>
                </div>
              </article>
            ))
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
      </main>
    </div>
  );
}

export default App;
