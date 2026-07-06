import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { db } from "./db";
import { formatDisplayDate, formatTime, toDateKey } from "./date";
import type { LogEntry, LogImage } from "./types";

const todayKey = toDateKey(new Date());

type BackupImage = Omit<LogImage, "blob"> & {
  dataUrl: string;
};

type BackupLogEntry = Omit<LogEntry, "images"> & {
  images: BackupImage[];
};

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
  const [pendingImage, setPendingImage] = useState<LogImage | null>(null);
  const [pendingImageUrl, setPendingImageUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [backupMessage, setBackupMessage] = useState("");
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isToday = selectedDate === todayKey;
  const trimmedText = text.trim();
  const canSubmit = Boolean(trimmedText || pendingImage);

  useEffect(() => {
    let isActive = true;

    async function loadLogs() {
      setIsLoading(true);
      const entries = await db.logs
        .where("date")
        .equals(selectedDate)
        .sortBy("createdAt");

      if (isActive) {
        setLogs(entries);
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

    const now = new Date();
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      date: selectedDate,
      createdAt: now.toISOString(),
      text: trimmedText,
      images: pendingImage ? [pendingImage] : [],
    };

    await db.logs.add(entry);
    setLogs((currentLogs) => [...currentLogs, entry]);
    setText("");
    setPendingImage(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
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
      allLogs.map(async (log) => ({
        ...log,
        images: await Promise.all(
          log.images.map(async (image) => ({
            id: image.id,
            name: image.name,
            type: image.type,
            createdAt: image.createdAt,
            dataUrl: await readFileAsDataUrl(image.blob),
          })),
        ),
      })),
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
      setLogs(entries);
      setBackupMessage(`${restoredLogs.length}件を読み込みました。`);
    } catch {
      setBackupMessage("バックアップを読み込めませんでした。");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="メニュー">
        <div className="brand">
          <span className="brand-mark">B</span>
          <span>Baseball Note</span>
        </div>

        <nav className="nav-list">
          <button
            className={isToday ? "nav-item active" : "nav-item"}
            type="button"
            onClick={() => setSelectedDate(todayKey)}
          >
            今日
          </button>
          <label className="date-picker">
            <span>日付</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
          <button className="nav-item" type="button" onClick={handleExportBackup}>
            バックアップ
          </button>
          <button
            className="nav-item"
            type="button"
            onClick={() => importInputRef.current?.click()}
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
            送信
          </button>
        </form>
      </main>
    </div>
  );
}

export default App;
