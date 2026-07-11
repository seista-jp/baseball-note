import type { LogEntry, LogImage, LogTag } from "./types";

const backupVersion = 1;
const validTags: readonly LogTag[] = ["打撃", "守備", "走塁", "投球", "体調", "フィジカル"];
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const dateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const imageDataUrlPattern = /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/;

export type BackupImage = Omit<LogImage, "blob"> & {
  dataUrl: string;
};

export type BackupLogEntry = Omit<LogEntry, "images"> & {
  images: BackupImage[];
};

export type BackupFile = {
  version: typeof backupVersion;
  logs: BackupLogEntry[];
};

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupValidationError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  fieldName: string,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string" || (!options.allowEmpty && value.trim().length === 0)) {
    throw new BackupValidationError(`${fieldName}が正しくありません。`);
  }

  return value;
}

function validateId(value: unknown, fieldName: string): string {
  const id = requireString(value, fieldName);

  if (!idPattern.test(id)) {
    throw new BackupValidationError(`${fieldName}の形式が正しくありません。`);
  }

  return id;
}

function validateDate(value: unknown, fieldName: string): string {
  const date = requireString(value, fieldName);
  const match = datePattern.exec(date);

  if (!match) {
    throw new BackupValidationError(`${fieldName}はYYYY-MM-DD形式で指定してください。`);
  }

  const [, year, month, day] = match;
  const parsedDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const isSameDate =
    parsedDate.getUTCFullYear() === Number(year) &&
    parsedDate.getUTCMonth() === Number(month) - 1 &&
    parsedDate.getUTCDate() === Number(day);

  if (!isSameDate) {
    throw new BackupValidationError(`${fieldName}に存在しない日付が指定されています。`);
  }

  return date;
}

function validateDateTime(value: unknown, fieldName: string): string {
  const dateTime = requireString(value, fieldName);

  if (!dateTimePattern.test(dateTime) || !Number.isFinite(Date.parse(dateTime))) {
    throw new BackupValidationError(`${fieldName}が正しくありません。`);
  }

  return dateTime;
}

function validateTags(value: unknown, fieldName: string): LogTag[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new BackupValidationError(`${fieldName}は配列で指定してください。`);
  }

  const tags = value.map((tag) => {
    if (typeof tag !== "string" || !validTags.includes(tag as LogTag)) {
      throw new BackupValidationError(`${fieldName}に未対応のタグが含まれています。`);
    }

    return tag as LogTag;
  });

  return [...new Set(tags)];
}

function validateImage(value: unknown, fieldName: string): BackupImage {
  if (!isObject(value)) {
    throw new BackupValidationError(`${fieldName}が正しくありません。`);
  }

  const type = requireString(value.type, `${fieldName}の種類`);
  const dataUrl = requireString(value.dataUrl, `${fieldName}のデータ`);
  const dataUrlMatch = imageDataUrlPattern.exec(dataUrl);

  if (!dataUrlMatch || dataUrlMatch[2].length === 0 || dataUrlMatch[2].length % 4 !== 0) {
    throw new BackupValidationError(`${fieldName}のData URLが正しくありません。`);
  }

  if (type.toLowerCase() !== "image/jpeg" || dataUrlMatch[1].toLowerCase() !== "image/jpeg") {
    throw new BackupValidationError(`${fieldName}はJPEG形式で指定してください。`);
  }

  try {
    atob(dataUrlMatch[2]);
  } catch {
    throw new BackupValidationError(`${fieldName}の画像データが壊れています。`);
  }

  return {
    id: validateId(value.id, `${fieldName}のID`),
    name: requireString(value.name, `${fieldName}のファイル名`),
    type,
    createdAt: validateDateTime(value.createdAt, `${fieldName}の作成日時`),
    dataUrl,
  };
}

function validateLog(value: unknown, index: number): BackupLogEntry {
  const fieldName = `${index + 1}件目のメモ`;

  if (!isObject(value)) {
    throw new BackupValidationError(`${fieldName}が正しくありません。`);
  }

  const rawImages = value.images ?? [];

  if (!Array.isArray(rawImages)) {
    throw new BackupValidationError(`${fieldName}の画像は配列で指定してください。`);
  }

  if (rawImages.length > 1) {
    throw new BackupValidationError(`${fieldName}には画像を1枚まで指定できます。`);
  }

  return {
    id: validateId(value.id, `${fieldName}のID`),
    date: validateDate(value.date, `${fieldName}の日付`),
    createdAt: validateDateTime(value.createdAt, `${fieldName}の作成日時`),
    text: requireString(value.text, `${fieldName}の本文`, { allowEmpty: true }),
    tags: validateTags(value.tags, `${fieldName}のタグ`),
    images: rawImages.map((image) => validateImage(image, `${fieldName}の画像`)),
  };
}

export function validateBackup(value: unknown): BackupFile {
  if (!isObject(value)) {
    throw new BackupValidationError("バックアップ全体の形式が正しくありません。");
  }

  if (value.version !== backupVersion) {
    const versionLabel = typeof value.version === "number" ? String(value.version) : "不明";
    throw new BackupValidationError(
      `バックアップのバージョン${versionLabel}には対応していません。対応版は1です。`,
    );
  }

  if (!Array.isArray(value.logs)) {
    throw new BackupValidationError("メモの一覧が見つかりません。");
  }

  const logs = value.logs.map(validateLog);
  const logIds = new Set<string>();

  for (const log of logs) {
    if (logIds.has(log.id)) {
      throw new BackupValidationError(`メモID「${log.id}」が重複しています。`);
    }

    logIds.add(log.id);
  }

  return { version: backupVersion, logs };
}
