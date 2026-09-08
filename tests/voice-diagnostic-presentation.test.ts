import { presentVoiceDiagnostic, type VoiceDiagnostic } from "../src/voiceDiagnostics";

function expectEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

const normal: VoiceDiagnostic = {
  id: "normal", createdAt: "2026-09-08T06:00:00.000Z", startedAt: "2026-09-08T06:00:00.000Z", savedAt: "2026-09-08T06:00:05.000Z",
  language: "ja-JP", maxDurationMs: 180000, status: "ended", endReason: "本人が話し終わりを押しました",
  resultText: "通常終了", unconfirmedResults: [], recognitionNotifications: [], events: [],
};
const interrupted: VoiceDiagnostic = { ...normal, id: "interrupted", status: "interrupted", resultText: "中断前の文字" };

const current = presentVoiceDiagnostic(normal, interrupted, null);
expectEqual(current.kind, "current", "current session wins over old diagnostics");
expectEqual(current.copyLabel, "今回の診断をコピー", "current diagnostic has a current label");

const restored = presentVoiceDiagnostic(null, interrupted, normal);
expectEqual(restored.kind, "interrupted-previous", "reloaded pending diagnostic is explicitly interrupted previous");
expectEqual(restored.copyLabel, "中断した前回の診断をコピー", "reloaded pending diagnostic is never copied as current");

const previous = presentVoiceDiagnostic(null, null, normal);
expectEqual(previous.kind, "previous", "old completed diagnostic is not current after reload");
expectEqual(previous.title, "前回完了した診断（今回の診断ではありません）", "old completed diagnostic is labelled accurately");

const none = presentVoiceDiagnostic(null, null, null);
expectEqual(none.kind, "none", "no diagnostic does not fall back to an unrelated result");

console.log("voice-diagnostic-presentation: 4/4 passed");
