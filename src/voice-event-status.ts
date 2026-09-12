export type VoiceEventPhase = "idle" | "connecting" | "started" | "speech" | "waiting" | "ending" | "ended" | "error" | "unavailable";
export type VoiceEventState = {
  session: number;
  run: number;
  phase: VoiceEventPhase;
  awaitingStart: boolean;
  runOpen: boolean;
  finished: boolean;
  hasText: boolean;
  error: string;
};
export const createVoiceEventState = (): VoiceEventState => ({
  session: 0, run: 0, phase: "idle", awaitingStart: false, runOpen: false, finished: false, hasText: false, error: "",
});
export type VoiceEventAction =
  | { type: "request" | "start" | "speechstart" | "speechend" | "end"; session: number; run: number }
  | { type: "error"; session: number; run: number; error: string }
  | { type: "stop"; session: number }
  | { type: "finish"; session: number; hasText: boolean; failed: boolean }
  | { type: "unavailable"; detail: string };

export function reduceVoiceEventState(state: VoiceEventState, event: VoiceEventAction): VoiceEventState {
  if (event.type === "unavailable") return { ...state, phase: "unavailable", finished: true, awaitingStart: false, runOpen: false, error: event.detail };
  if (event.type === "request") {
    if (event.session < state.session || (event.session === state.session && (state.finished || state.phase === "ending" || event.run <= state.run))) return state;
    return { ...createVoiceEventState(), session: event.session, run: event.run, phase: "connecting", awaitingStart: true };
  }
  if (event.session !== state.session || state.finished) return state;
  if (event.type === "finish") return { ...state, phase: event.failed ? "error" : "ended", finished: true, awaitingStart: false, runOpen: false, hasText: event.hasText };
  if (event.type === "stop") return { ...state, phase: "ending", awaitingStart: false, runOpen: false };
  if (event.run !== state.run) return state;
  if (event.type === "error") {
    if (state.phase === "ending" && (event.error === "aborted" || event.error === "no-speech")) return state;
    return { ...state, phase: "error", awaitingStart: false, runOpen: false, error: event.error };
  }
  if (state.phase === "ending") return state;
  if (event.type === "end") return { ...state, phase: "connecting", awaitingStart: false, runOpen: false };
  if (event.type === "start") {
    if (!state.awaitingStart) return state;
    return { ...state, phase: "started", awaitingStart: false, runOpen: true, error: "" };
  }
  if (!state.runOpen) return state;
  return { ...state, phase: event.type === "speechstart" ? "speech" : "waiting" };
}

export function voiceEventErrorMessage(error: string): string {
  const messages: Record<string, string> = {
    "no-speech": "音声を検出できなかったと認識サービスから通知されました。",
    "not-allowed": "音声入力の許可を確認してください。",
    NotAllowedError: "音声入力の許可を確認してください。",
    "service-not-allowed": "音声認識サービスを利用できません。",
    "audio-capture": "マイクを利用できません。",
    "network": "通信状況を確認してください。",
    "aborted": "音声入力が中断されました。",
    "language-not-supported": "指定言語の音声認識を利用できません。",
    "bad-grammar": "音声認識の設定を確認してください。",
  };
  return error ? `${messages[error] ?? "音声入力を続けられませんでした。"}（${error}）` : "音声入力を続けられませんでした。";
}

export function presentVoiceEventState(state: VoiceEventState): { label: string; detail: string } {
  const labels: Record<VoiceEventPhase, string> = {
    idle: "音声入力は開始していません",
    connecting: "接続中",
    started: "音声入力を開始しました",
    speech: "話し声を検知しました",
    waiting: "次の言葉を待っています",
    ending: "終了処理中",
    ended: "音声入力を終了しました",
    error: "音声認識からエラーの通知",
    unavailable: "音声入力を開始できません",
  };
  let detail = "通知にもとづく表示です。音量や文字取得の成功を示すものではありません。";
  if (state.phase === "ending") detail = "届いている文字は残し、最終結果を待ちます。";
  if (state.phase === "ended") detail = state.hasText ? "今回取得した文字は本文に残しています。" : "今回の認識文字は0件でした。手入力はそのまま使えます。";
  if (state.phase === "error") detail = voiceEventErrorMessage(state.error) + (state.finished && !state.hasText ? " 今回の認識文字は0件でした。" : "");
  if (state.phase === "unavailable") detail = state.error;
  return { label: labels[state.phase], detail };
}
