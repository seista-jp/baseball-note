import { applyRecognitionEvent, RecognitionTranscriptState } from "../src/recognition-result-merge";

function expectEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

// 分離試作に保存されたPixel 7a生ログ（2026-09-07T01:26:50.593Z）から、
// 実際に文字列が残っている結果 #3 と #10 をそのまま使う。今回の組み込み版の
// 実機経過を再現するものではない。
const pixelLogState = new RecognitionTranscriptState();
const baseText = "開始前の本文。";
const reflectIntoComposer = (): string => `${baseText}${pixelLogState.text()}`;

applyRecognitionEvent(pixelLogState, { recognitionSession: 1, utteranceNumber: 1, resultIndex: 3 }, [
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "昨日は" },
]);
expectEqual(reflectIntoComposer(), "開始前の本文。昨日は", "the first reflected text appends only to the captured base text");

applyRecognitionEvent(pixelLogState, { recognitionSession: 1, utteranceNumber: 1, resultIndex: 10 }, [
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "昨日は" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "昨日は途中で止まってしまってしまい" },
]);
expectEqual(reflectIntoComposer(), "開始前の本文。昨日は途中で止まってしまってしまい", "later cumulative result replaces the voice part without duplicating the base text");

// 同一の通知がもう一度来ても、本文へ加える音声部分は増えない。
applyRecognitionEvent(pixelLogState, { recognitionSession: 1, utteranceNumber: 1, resultIndex: 10 }, [
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "昨日は" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "" },
  { isFinal: true, text: "昨日は途中で止まってしまってしまい" },
]);
expectEqual(reflectIntoComposer(), "開始前の本文。昨日は途中で止まってしまってしまい", "repeated raw notification does not append a second copy");

// 自動再開後に同じ累積文字が届いても、発話終了通知がなければ同じ発話として統合する。
applyRecognitionEvent(pixelLogState, { recognitionSession: 2, utteranceNumber: 1, resultIndex: 0 }, [
  { isFinal: true, text: "昨日は途中で止まってしまってしまい" },
]);
expectEqual(reflectIntoComposer(), "開始前の本文。昨日は途中で止まってしまってしまい", "automatic restart does not append a repeated cumulative sentence as a new utterance");

// 発話終了後の次の発話として届けば、実際の繰り返しは残す。
applyRecognitionEvent(pixelLogState, { recognitionSession: 2, utteranceNumber: 2, resultIndex: 1 }, [
  { isFinal: true, text: "" }, { isFinal: true, text: "昨日は途中で止まってしまってしまい" },
]);
expectEqual(reflectIntoComposer(), "開始前の本文。昨日は途中で止まってしまってしまい昨日は途中で止まってしまってしまい", "a repeated phrase in a separately detected utterance remains");

// 停止時の途中結果を、同じ結果番号の確定結果で置き換える経路も本文反映まで確認する。
const stoppedState = new RecognitionTranscriptState();
applyRecognitionEvent(stoppedState, { recognitionSession: 1, utteranceNumber: 1, resultIndex: 0 }, [
  { isFinal: true, text: "前半" }, { isFinal: false, text: "後半の途中" },
]);
stoppedState.freezeInterimResults();
applyRecognitionEvent(stoppedState, { recognitionSession: 1, utteranceNumber: 1, resultIndex: 1 }, [
  { isFinal: true, text: "前半" }, { isFinal: true, text: "後半の確定" },
]);
expectEqual(`開始前の本文。${stoppedState.text()}`, "開始前の本文。前半後半の確定", "final result after stop replaces its interim part once in the composer path");

console.log("voice-integration-transcript: 6/6 passed");
