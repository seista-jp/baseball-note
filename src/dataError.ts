const quotaErrorNames = new Set(["QuotaExceededError", "QuotaError"]);

type ErrorWithDetails = {
  name?: unknown;
  inner?: unknown;
  cause?: unknown;
};

export function isStorageQuotaError(error: unknown): boolean {
  const checkedErrors = new Set<unknown>();
  let currentError = error;

  while (
    typeof currentError === "object" &&
    currentError !== null &&
    !checkedErrors.has(currentError)
  ) {
    checkedErrors.add(currentError);
    const errorDetails = currentError as ErrorWithDetails;

    if (typeof errorDetails.name === "string" && quotaErrorNames.has(errorDetails.name)) {
      return true;
    }

    currentError = errorDetails.inner ?? errorDetails.cause;
  }

  return false;
}

export function getDataWriteErrorMessage(error: unknown, fallbackMessage: string): string {
  if (isStorageQuotaError(error)) {
    return "保存容量が不足しています。まずバックアップを書き出し、不要な画像付きメモを整理してから、もう一度試してください。";
  }

  return fallbackMessage;
}
