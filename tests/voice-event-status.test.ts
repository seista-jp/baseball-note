import { createVoiceEventState, presentVoiceEventState, reduceVoiceEventState, type VoiceEventAction } from "../src/voice-event-status";
let passed = 0;
function test(name: string, run: () => void) { run(); passed += 1; console.log("PASS " + name); }
function expect(value: unknown, message: string) { if (!value) throw new Error(message); }
function session() {
  let state = createVoiceEventState();
  return {
    send(event: VoiceEventAction) { state = reduceVoiceEventState(state, event); },
    label: () => presentVoiceEventState(state).label,
    detail: () => presentVoiceEventState(state).detail,
    state: () => state,
  };
}
const request = { type: "request", session: 1, run: 1 } as const;
const start = { type: "start", session: 1, run: 1 } as const;
test("要求だけでは接続中、開始通知だけでは開始済み", () => {
  const s = session(); s.send(request); expect(s.label() === "接続中", "request");
  s.send(start); expect(s.label() === "音声入力を開始しました", "start");
  expect(s.detail().includes("文字取得の成功を示すものではありません"), "not recognition success");
});
test("発話通知の欠落を無言・発話中と推測しない", () => {
  const s = session(); s.send(request); s.send(start);
  for (let i = 0; i < 10; i += 1) expect(s.label() === "音声入力を開始しました", "no inferred speech or timer");
});
test("受信した発話開始・終了の順に表示する", () => {
  const s = session(); s.send(request); s.send(start);
  s.send({ ...start, type: "speechstart" }); expect(s.label() === "話し声を検知しました", "speech");
  s.send({ ...start, type: "speechend" }); expect(s.label() === "次の言葉を待っています", "speech end");
});
test("発話開始が欠けても受信した発話終了は表示する", () => {
  const s = session(); s.send(request); s.send(start); s.send({ ...start, type: "speechend" });
  expect(s.label() === "次の言葉を待っています", "actual speechend");
});
test("開始通知がない間は発話状態へ飛ばない", () => {
  const s = session(); s.send(request); s.send({ ...start, type: "speechstart" });
  expect(s.label() === "接続中", "missing start");
});
test("認識終了後は接続中、旧runの遅い発話・開始を無視", () => {
  const s = session(); s.send(request); s.send(start); s.send({ ...start, type: "end" });
  s.send({ ...start, type: "speechstart" }); s.send({ ...start, type: "speechend" }); s.send(start);
  expect(s.label() === "接続中", "late old events while awaiting restart");
});
test("再開要求後も新しい開始通知まで接続中", () => {
  const s = session(); s.send(request); s.send(start); s.send({ ...start, type: "end" });
  s.send({ ...request, run: 2 }); s.send(start);
  expect(s.label() === "接続中", "ignore old run");
  s.send({ ...start, run: 2 }); expect(s.label() === "音声入力を開始しました", "new run");
});
test("終了処理中は開始・発話・終了・予定済み再開要求で戻らない", () => {
  const s = session(); s.send(request); s.send(start); s.send({ type: "stop", session: 1 });
  for (const type of ["start", "speechstart", "speechend", "end"] as const) s.send({ ...start, type });
  s.send({ ...request, run: 2 });
  expect(s.label() === "終了処理中", "late notices");
});
test("終了完了後の通知は表示を変えない", () => {
  const s = session(); s.send(request); s.send({ type: "stop", session: 1 });
  s.send({ type: "finish", session: 1, failed: false, hasText: true });
  for (const type of ["start", "speechstart", "speechend", "end"] as const) s.send({ ...start, type });
  s.send({ ...request, run: 2 }); s.send({ ...start, type: "error", error: "network" });
  expect(s.label() === "音声入力を終了しました", "finished latch");
});
test("文字0件は今回の結果から判定し、空終了を案内", () => {
  const s = session(); s.send(request); s.send(start);
  s.send({ type: "finish", session: 1, failed: false, hasText: false });
  expect(s.detail().includes("今回の認識文字は0件"), "zero");
});
test("途中結果・後着確定文字が残る場合は0件扱いしない", () => {
  const s = session(); s.send(request); s.send({ type: "stop", session: 1 });
  s.send({ type: "finish", session: 1, failed: false, hasText: true });
  expect(!s.detail().includes("0件"), "text retained");
});
test("次セッションへ前回の通知・完了・停止を混ぜない", () => {
  const s = session(); s.send(request); s.send({ ...request, session: 2 }); s.send({ ...start, session: 2 });
  s.send({ type: "stop", session: 1 }); s.send({ type: "finish", session: 1, failed: false, hasText: false });
  s.send(start); s.send(request);
  expect(s.state().session === 2 && s.label() === "音声入力を開始しました", "new session protected");
});
test("通知されたエラー名を案内し、異常終了で失わない", () => {
  for (const error of ["network", "not-allowed", "audio-capture", "service-not-allowed", "language-not-supported", "InvalidStateError", "unknown"]) {
    const s = session(); s.send(request); s.send({ ...start, type: "error", error });
    s.send({ ...start, type: "end" }); s.send({ type: "finish", session: 1, failed: true, hasText: false });
    expect(s.label() === "音声認識からエラーの通知" && s.detail().includes(error), error);
    expect(s.detail().includes("0件"), "error zero");
  }
});
test("no-speechは通知として表示し、通常の再開へ戻る", () => {
  const s = session(); s.send(request); s.send(start); s.send({ ...start, type: "error", error: "no-speech" });
  expect(s.detail().includes("認識サービスから通知"), "no guessing");
  s.send({ ...start, type: "end" }); expect(s.label() === "接続中", "restart pending");
});
test("本人停止後のaborted/no-speechで終了処理中を壊さない", () => {
  const s = session(); s.send(request); s.send({ type: "stop", session: 1 });
  for (const error of ["aborted", "no-speech"]) s.send({ ...start, type: "error", error });
  expect(s.label() === "終了処理中", "intentional ending");
});
test("非対応案内のあと新しく開始できる", () => {
  const s = session(); s.send({ type: "unavailable", detail: "HTTPSが必要です" });
  expect(s.detail() === "HTTPSが必要です", "actual reason");
  s.send(request); expect(s.label() === "接続中", "new attempt");
});
console.log("voice-event-status: " + passed + "/" + passed + " passed");
