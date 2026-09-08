import { canRestartRecognition, mergeFinalSnapshots, mergeUtteranceSnapshots, recognitionStartPlan, recognitionStatusAfterEnd, RecognitionTranscriptState } from "./recognition-result-merge";

function expectEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const capturedSnapshots = [
  "", "", "今日は", "今日は", "今日は", "今日は", "今日は",
  "今日は 軸足", "今日は 軸足", "今日は 軸足", "今日は 軸足", "今日は 軸足", "今日は 軸足", "今日は 軸足",
  "今日は 軸足 と脱力を意識しました", "今日は 軸足 と脱力を意識しました",
];
expectEqual(mergeFinalSnapshots(capturedSnapshots), "今日は 軸足 と脱力を意識しました", "captured cumulative results");
expectEqual(
  mergeFinalSnapshots([
    "今日は バッティングで軸足と脱力を意識しました",
    "今日は バッティングで軸足と脱力を意識しました 最初は",
    "今日は バッティングで軸足と脱力を意識しました",
    "今日は バッティングで軸足と脱力を意識しました 最初はバットを強く握りすぎてタイミングが合いませんでした",
    "今日は バッティングで軸足と脱力を意識しました",
    "今日は バッティングで軸足と脱力を意識しました 最初はバットを強く握りすぎてタイミングが合いませんでした 途中から少し力を抜くと体がスムーズに回る感じがありました",
    "今日は バッティングで軸足と脱力を意識しました 最初はバットを強く握りすぎてタイミングが合いませんでした",
    "今日は バッティングで軸足と脱力を意識しました 最初はバットを強く握りすぎてタイミングが合いませんでした 途中から少し力を抜くと体がスムーズに回る感じがありました ただ早いボールでは 前に突っ込んでしまいました",
    "今日は バッティングで軸足と脱力を意識しました 最初はバットを強く握りすぎてタイミングが合いませんでした 途中から少し力を抜くと体がスムーズに回る感じがありました ただ早いボールでは 前に突っ込んでしまいました 次の練習では構えを固めすぎず ボールをよく見て 自分のリズムで振ることを試したいです",
  ]),
  "今日は バッティングで軸足と脱力を意識しました 最初はバットを強く握りすぎてタイミングが合いませんでした 途中から少し力を抜くと体がスムーズに回る感じがありました ただ早いボールでは 前に突っ込んでしまいました 次の練習では構えを固めすぎず ボールをよく見て 自分のリズムで振ることを試したいです",
  "android nonmonotonic cumulative results keep the ending",
);
expectEqual(mergeFinalSnapshots(["今日は", "今日は今日は 軸足"]), "今日は今日は 軸足", "a spoken repetition included in a cumulative result");
expectEqual(mergeFinalSnapshots(["今日は", "軸足と脱力を意識しました"]), "今日は軸足と脱力を意識しました", "an unproven boundary keeps the later text");
expectEqual(mergeUtteranceSnapshots([["今日は"], ["今日は"]]), "今日は今日は", "a repeated utterance separated by speech boundaries");
expectEqual(mergeUtteranceSnapshots([["今日は"], ["軸足と脱力を意識しました"]]), "今日は軸足と脱力を意識しました", "independent utterances");

const ipadState = new RecognitionTranscriptState();
ipadState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 0, text: "スイングの常識としては重心をしっかり揃えることによってボールに対して垂直に入るので", isFinal: true });
ipadState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 1, text: "強い卓球が打てると思います今日の良くないところはかかとに重心が乗っていたため軸がうまく取れていなかったのでその辺の修正が必要です", isFinal: false });
expectEqual(ipadState.text(), "スイングの常識としては重心をしっかり揃えることによってボールに対して垂直に入るので強い卓球が打てると思います今日の良くないところはかかとに重心が乗っていたため軸がうまく取れていなかったのでその辺の修正が必要です", "iPad stopped with an interim ending");
expectEqual(String(ipadState.freezeInterimResults().length), "1", "iPad interim result is retained at stop");
ipadState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 1, text: "強い卓球が打てると思います今日の良くないところはかかとに重心が乗っていたため軸がうまく取れていなかったのでその辺の修正が必要です", isFinal: false });
expectEqual(ipadState.text(), "スイングの常識としては重心をしっかり揃えることによってボールに対して垂直に入るので強い卓球が打てると思います今日の良くないところはかかとに重心が乗っていたため軸がうまく取れていなかったのでその辺の修正が必要です", "a later interim cannot replace the stopped snapshot");
ipadState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 1, text: "強い卓球が打てると思います。修正後の後半です", isFinal: true });
expectEqual(ipadState.text(), "スイングの常識としては重心をしっかり揃えることによってボールに対して垂直に入るので強い卓球が打てると思います。修正後の後半です", "a final result replaces the retained interim once");
expectEqual(String(ipadState.unconfirmedResults().length), "0", "final result clears its unconfirmed marker");

const androidState = new RecognitionTranscriptState();
androidState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 0, text: "今日は", isFinal: true });
androidState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 1, text: "今日は 軸足", isFinal: true });
androidState.apply({ recognitionSession: 1, utteranceNumber: 1, resultIndex: 2, text: "今日は 軸足 と脱力を意識しました", isFinal: true });
expectEqual(androidState.text(), "今日は 軸足 と脱力を意識しました", "Android cumulative final results remain merged");
expectEqual(String(canRestartRecognition(true, false, true)), "true", "a normal recognition end may restart");
expectEqual(String(canRestartRecognition(true, true, true)), "false", "a scheduled restart is blocked after stop is requested");
const sharedTrack = { id: "shared-track" };
const initialSharedPlan = recognitionStartPlan(true, sharedTrack, true);
const restartSharedPlan = recognitionStartPlan(true, sharedTrack, true);
expectEqual(initialSharedPlan.action, "start-with-track", "the shared track is passed on the initial start");
expectEqual(restartSharedPlan.action, "start-with-track", "the shared track is passed on restart");
if (initialSharedPlan.action !== "start-with-track" || restartSharedPlan.action !== "start-with-track" || initialSharedPlan.audioTrack !== sharedTrack || restartSharedPlan.audioTrack !== sharedTrack) throw new Error("initial and restart must preserve the same shared track");
expectEqual(recognitionStartPlan(true, sharedTrack, false).action, "do-not-restart-ended-track", "an ended shared track never falls back to start without an argument");
expectEqual(recognitionStartPlan(false, undefined, false).action, "start-without-track", "the direct microphone comparison keeps start without an argument");
expectEqual(recognitionStatusAfterEnd(false, false), "ended", "a normal recognition end is saved as ended");
expectEqual(recognitionStatusAfterEnd(true, false), "failed", "an actual recognition error remains failed");
expectEqual(recognitionStatusAfterEnd(false, true), "aborted-by-app", "an app-requested abort is distinct from an error");

console.log("recognition-result-merge: 22/22 passed");
