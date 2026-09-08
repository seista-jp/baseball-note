/* Shared with the normal-record development integration. */
export * from "../src/recognition-result-merge";

/*
export function mergeFinalSnapshots(snapshots: string[]): string {
  let latestCumulativeSnapshot = "";
  for (const rawSnapshot of snapshots) {
    const snapshot = rawSnapshot.trim();
    if (!snapshot) continue;
    if (!latestCumulativeSnapshot) {
      latestCumulativeSnapshot = snapshot;
    } else if (snapshot === latestCumulativeSnapshot || latestCumulativeSnapshot.startsWith(snapshot)) {
      // Android Chromeで確認した「長い累積文の後に短い過去文が戻る」通知は、
      // 新しい発話ではないため、画面・保存のどちらにも追記しない。
    } else if (snapshot.startsWith(latestCumulativeSnapshot)) {
      // 「今日は」→「今日は 軸足」のような、同じ発話の累積通知は最新文へ置き換える。
      latestCumulativeSnapshot = snapshot;
    } else {
      // 前後関係をコードだけでは判定できない。後から届いた訂正や実際に続けて
      // 話した別の文を失わないよう、どちらも保持する。
      latestCumulativeSnapshot += snapshot;
    }
  }
  return latestCumulativeSnapshot;
}

export function mergeUtteranceSnapshots(utterances: string[][]): string {
  return utterances.map((snapshots) => mergeFinalSnapshots(snapshots)).filter(Boolean).join("");
}

export type UnconfirmedRecognitionResult = {
  recognitionSession: number;
  utteranceNumber: number;
  resultIndex: number;
  text: string;
};

type RecognitionResult = UnconfirmedRecognitionResult & { isFinal: boolean };
type ApplyResult = "new-final" | "corrected-final" | "same-final" | "interim" | "ignored-after-final" | "ignored-after-stop";

// Web Speech API は、同じ resultIndex の途中結果を何度も送り、最後に確定結果で
// 置き換える。この状態は画面表示と保存で共用する。停止時は途中結果を凍結し、
// その後に届く確定結果だけが凍結した文字を置き換えられるようにする。
export class RecognitionTranscriptState {
  private readonly finalResults = new Map<string, RecognitionResult>();
  private readonly interimResults = new Map<string, RecognitionResult>();
  private frozenInterimResults: Map<string, RecognitionResult> | null = null;

  apply(result: RecognitionResult): ApplyResult {
    const key = this.key(result);
    if (result.isFinal) {
      const previous = this.finalResults.get(key);
      this.finalResults.set(key, result);
      this.interimResults.delete(key);
      this.frozenInterimResults?.delete(key);
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
    const byUtterance = new Map<number, RecognitionResult[]>();
    for (const result of this.finalResults.values()) this.addToUtterance(byUtterance, result);
    for (const result of this.activeInterimResults().values()) this.addToUtterance(byUtterance, result);
    return [...byUtterance.entries()]
      .sort(([left], [right]) => left - right)
      .map(([, results]) => mergeFinalSnapshots(results.sort((left, right) => left.resultIndex - right.resultIndex).map((result) => result.text)))
      .filter(Boolean)
      .join("");
  }

  unconfirmedResults(): UnconfirmedRecognitionResult[] {
    return [...this.activeInterimResults().values()]
      .sort((left, right) => left.utteranceNumber - right.utteranceNumber || left.resultIndex - right.resultIndex)
      .map(({ recognitionSession, utteranceNumber, resultIndex, text }) => ({ recognitionSession, utteranceNumber, resultIndex, text }));
  }

  hasResultsInUtterance(utteranceNumber: number): boolean {
    return [...this.finalResults.values(), ...this.activeInterimResults().values()].some((result) => result.utteranceNumber === utteranceNumber);
  }

  private key(result: RecognitionResult): string { return `${result.recognitionSession}:${result.resultIndex}`; }
  private activeInterimResults(): Map<string, RecognitionResult> { return this.frozenInterimResults ?? this.interimResults; }
  private addToUtterance(target: Map<number, RecognitionResult[]>, result: RecognitionResult): void {
    const results = target.get(result.utteranceNumber) ?? [];
    results.push(result);
    target.set(result.utteranceNumber, results);
  }
}

// 認識終了の直後に予約した再開でも、利用者が「話し終わり」を押した後は実行しない。
export function canRestartRecognition(isRunning: boolean, isStopping: boolean, isCurrentRecognition: boolean): boolean {
  return isRunning && !isStopping && isCurrentRecognition;
}

export type RecognitionStartPlan<T> =
  | { action: "start-with-track"; audioTrack: T }
  | { action: "start-without-track" }
  | { action: "do-not-restart-ended-track" };

// 共有トラック方式は、初回と再開で同じ入力経路を使う。トラックが終わった時に
// 引数なしの start() へ切り替えると比較条件が変わるため、再開を行わない。
export function recognitionStartPlan<T>(usesSharedTrack: boolean, audioTrack: T | undefined, trackIsLive: boolean): RecognitionStartPlan<T> {
  if (!usesSharedTrack) return { action: "start-without-track" };
  if (!audioTrack || !trackIsLive) return { action: "do-not-restart-ended-track" };
  return { action: "start-with-track", audioTrack };
}

export function recognitionStatusAfterEnd(recognitionHadError: boolean, recognitionAbortRequestedByApp: boolean): "ended" | "failed" | "aborted-by-app" {
  if (recognitionAbortRequestedByApp) return "aborted-by-app";
  return recognitionHadError ? "failed" : "ended";
}
*/
