export function mergeFinalSnapshots(snapshots: string[]): string {
  let latestCumulativeSnapshot = "";
  for (const rawSnapshot of snapshots) {
    const snapshot = rawSnapshot.trim();
    if (!snapshot) continue;
    if (!latestCumulativeSnapshot) latestCumulativeSnapshot = snapshot;
    else if (snapshot === latestCumulativeSnapshot || latestCumulativeSnapshot.startsWith(snapshot)) {
      // Android Chromeでは、長い累積文の後に短い過去文が戻ることがある。
    } else if (snapshot.startsWith(latestCumulativeSnapshot)) latestCumulativeSnapshot = snapshot;
    else latestCumulativeSnapshot += snapshot;
  }
  return latestCumulativeSnapshot;
}

export function mergeUtteranceSnapshots(utterances: string[][]): string {
  return utterances.map((snapshots) => mergeFinalSnapshots(snapshots)).filter(Boolean).join("");
}

export type UnconfirmedRecognitionResult = { recognitionSession: number; utteranceNumber: number; resultIndex: number; text: string };
type RecognitionResult = UnconfirmedRecognitionResult & { isFinal: boolean };
export type RecognitionApplyResult = "new-final" | "corrected-final" | "same-final" | "interim" | "ignored-after-final" | "ignored-after-stop";
export type RecognitionResultSnapshot = { isFinal: boolean; text: string };
export type RecognitionEventUpdate = {
  recognitionSession: number;
  utteranceNumber: number;
  resultIndex: number;
  isFinal: boolean;
  text: string;
  outcome: RecognitionApplyResult;
};

// 画面表示と保存する本文の両方で使う。停止時は途中結果を凍結し、後から届く
// 対応する確定結果だけで置き換える。
export class RecognitionTranscriptState {
  private readonly finalResults = new Map<string, RecognitionResult>();
  private readonly interimResults = new Map<string, RecognitionResult>();
  private frozenInterimResults: Map<string, RecognitionResult> | null = null;

  apply(result: RecognitionResult): RecognitionApplyResult {
    const key = `${result.recognitionSession}:${result.resultIndex}`;
    if (result.isFinal) {
      const previous = this.finalResults.get(key);
      this.finalResults.set(key, result); this.interimResults.delete(key); this.frozenInterimResults?.delete(key);
      return !previous ? "new-final" : previous.text === result.text ? "same-final" : "corrected-final";
    }
    if (this.finalResults.has(key)) return "ignored-after-final";
    if (this.frozenInterimResults) return "ignored-after-stop";
    this.interimResults.set(key, result);
    return "interim";
  }

  freezeInterimResults(): UnconfirmedRecognitionResult[] {
    if (!this.frozenInterimResults) this.frozenInterimResults = new Map(this.interimResults);
    return this.unconfirmedResults();
  }

  text(): string {
    const utterances = new Map<number, RecognitionResult[]>();
    const add = (result: RecognitionResult): void => { const values = utterances.get(result.utteranceNumber) ?? []; values.push(result); utterances.set(result.utteranceNumber, values); };
    this.finalResults.forEach(add); this.activeInterimResults().forEach(add);
    return [...utterances.entries()].sort(([left], [right]) => left - right)
      .map(([, results]) => mergeFinalSnapshots(results.sort((left, right) => left.resultIndex - right.resultIndex).map((result) => result.text)))
      .filter(Boolean).join("");
  }

  unconfirmedResults(): UnconfirmedRecognitionResult[] {
    return [...this.activeInterimResults().values()].sort((left, right) => left.utteranceNumber - right.utteranceNumber || left.resultIndex - right.resultIndex)
      .map(({ recognitionSession, utteranceNumber, resultIndex, text }) => ({ recognitionSession, utteranceNumber, resultIndex, text }));
  }

  hasResultsInUtterance(utteranceNumber: number): boolean {
    return [...this.finalResults.values(), ...this.activeInterimResults().values()].some((result) => result.utteranceNumber === utteranceNumber);
  }

  private activeInterimResults(): Map<string, RecognitionResult> { return this.frozenInterimResults ?? this.interimResults; }
}

// Web Speech API の resultIndex は「今回変化した先頭の結果番号」。分離試作と
// 組み込み版で同じ入力範囲を使うため、そこから後ろだけを統合する。
export function applyRecognitionEvent(
  state: RecognitionTranscriptState,
  context: { recognitionSession: number; utteranceNumber: number; resultIndex: number },
  results: ArrayLike<RecognitionResultSnapshot>,
): RecognitionEventUpdate[] {
  const updates: RecognitionEventUpdate[] = [];
  for (let index = Math.max(0, context.resultIndex); index < results.length; index += 1) {
    const result = results[index];
    const text = result?.text ?? "";
    const isFinal = Boolean(result?.isFinal);
    const outcome = state.apply({ ...context, resultIndex: index, text, isFinal });
    updates.push({ ...context, resultIndex: index, text, isFinal, outcome });
  }
  return updates;
}

export function canRestartRecognition(isRunning: boolean, isStopping: boolean, isCurrentRecognition: boolean): boolean {
  return isRunning && !isStopping && isCurrentRecognition;
}

export type RecognitionStartPlan<T> =
  | { action: "start-with-track"; audioTrack: T }
  | { action: "start-without-track" }
  | { action: "do-not-restart-ended-track" };

export function recognitionStartPlan<T>(usesSharedTrack: boolean, audioTrack: T | undefined, trackIsLive: boolean): RecognitionStartPlan<T> {
  if (!usesSharedTrack) return { action: "start-without-track" };
  if (!audioTrack || !trackIsLive) return { action: "do-not-restart-ended-track" };
  return { action: "start-with-track", audioTrack };
}

export function recognitionStatusAfterEnd(recognitionHadError: boolean, recognitionAbortRequestedByApp: boolean): "ended" | "failed" | "aborted-by-app" {
  if (recognitionAbortRequestedByApp) return "aborted-by-app";
  return recognitionHadError ? "failed" : "ended";
}
