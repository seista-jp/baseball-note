import React from "react";
import { createRoot } from "react-dom/client";
import Dexie from "dexie";
import App from "../src/App";
import { createDatabase } from "../src/db";
import { ComposerDraft } from "../src/drafts";
import "../src/styles.css";

const output = document.querySelector<HTMLPreElement>("#results")!;
const host = document.querySelector<HTMLDivElement>("#test-app")!;
const messages: string[] = [];
const report = (message: string) => { messages.push(message); output.textContent = messages.join("\n"); };
function expect(value: unknown, message: string) { if (!value) throw new Error(message); }
const delay = (ms = 10) => new Promise(resolve => window.setTimeout(resolve, ms));
async function until(check: () => boolean, label: string) {
  for (let i = 0; i < 400; i += 1) { if (check()) return; await delay(); }
  throw new Error("待機失敗: " + label);
}
class Recognition {
  static instances: Recognition[] = [];
  lang = ""; continuous = false; interimResults = false;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: { resultIndex: number; results: Array<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null;
  constructor() { Recognition.instances.push(this); }
  start() {}
  stop() { this.onend?.(); }
  abort() { this.onend?.(); }
  result(text: string, isFinal: boolean) { this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, isFinal }] }); }
}
const originals: Array<[object, string, PropertyDescriptor | undefined]> = [];
function replace(target: object, key: string, value: unknown) {
  originals.push([target, key, Object.getOwnPropertyDescriptor(target, key)]);
  Object.defineProperty(target, key, { configurable: true, value });
}
const preferences = new Map<string, string>([
  ["baseball-note-onboarding-completed", "1"],
  ["baseball-note-voice-input-consent", JSON.stringify({ version: "2026-09-08" })],
]);
replace(window, "localStorage", { getItem: (key: string) => preferences.get(key) ?? null, setItem: (key: string, value: string) => preferences.set(key, value), removeItem: (key: string) => preferences.delete(key) });
replace(window, "SpeechRecognition", Recognition);
let microphoneCalls = 0; let audioContextCalls = 0;
replace(navigator, "mediaDevices", { getUserMedia: async () => { microphoneCalls += 1; throw new Error("追加マイク禁止"); } });
replace(window, "AudioContext", class { constructor() { audioContextCalls += 1; throw new Error("音量解析禁止"); } });
const realNow = Date.now;
let offset = 0;
replace(Date, "now", () => realNow() + offset);
const testClock: { limitTick?: () => void } = {};
const realInterval = window.setInterval.bind(window);
replace(window, "setInterval", (handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
  if (timeout === 250 && typeof handler === "function") { testClock.limitTick = () => handler(); return 999999; }
  return realInterval(handler, timeout, ...args);
});

const suffix = crypto.randomUUID();
const dbName = "baseball-note-event-app-test-" + suffix;
const db = createDatabase(dbName);
let root = createRoot(host);
const button = (selector: string) => host.querySelector<HTMLButtonElement>(selector)!;
const textarea = () => host.querySelector<HTMLTextAreaElement>('textarea[aria-label="メモ"]')!;
const label = () => host.querySelector(".voice-event-label")?.textContent;
const detail = () => host.querySelector(".voice-event-detail")?.textContent ?? "";
async function click(selector: string) {
  expect(button(selector) && !button(selector).disabled, "操作可能なボタン: " + selector);
  button(selector).click(); await delay();
}
const heights: number[] = [];
function measure() {
  const panel = host.querySelector(".voice-input-panel")!;
  heights.push(panel.getBoundingClientRect().height);
  expect(document.documentElement.scrollWidth <= window.innerWidth, "横方向にはみ出さない");
}
let snapshot: Node | null = null;
try {
  const seed = new ComposerDraft(db, new Date().toISOString().slice(0, 10));
  await seed.start(); seed.update({ text: "既存本文。" }); await seed.settled();
  root.render(<App database={db} enableVoiceInput />);
  await until(() => !!button(".voice-input-start") && !button(".voice-input-start").disabled, "画面準備");
  await click(".voice-input-start");
  const first = Recognition.instances[0];
  expect(first.lang === "ja-JP" && first.continuous && first.interimResults, "認識設定維持");
  {
    expect(!host.querySelector(".voice-wave-toggle, .voice-diagnostic-panel"), "開発専用表示なし");
    expect(label() === "接続中", "開始通知前");
    measure();
    first.onstart?.(); await delay();
    expect(label() === "音声入力を開始しました", "開始通知");
    measure();
    await delay(30);
    expect(label() === "音声入力を開始しました", "発話通知が欠けても推測しない");
    first.result("途中の文字", false); await delay();
    expect(label() === "音声入力を開始しました", "結果通知を発話通知扱いしない");
    first.onspeechstart?.(); await delay();
    expect(label() === "話し声を検知しました", "発話開始"); measure();
    first.onspeechend?.(); await delay();
    expect(label() === "次の言葉を待っています", "発話終了"); measure();
    first.onend?.(); await delay();
    expect(label() === "接続中", "自動再開待ち"); measure();
    first.onspeechstart?.(); first.onstart?.(); await delay();
    expect(label() === "接続中", "終了済みrunの遅着");
    await until(() => Recognition.instances.length === 2, "既存200ms再開");
    const second = Recognition.instances[1];
    expect(label() === "接続中", "再開の開始通知前");
    second.onstart?.(); await delay(); measure();
    expect(label() === "音声入力を開始しました", "再開通知後");
    expect(Math.max(...heights) - Math.min(...heights) < 1, "再接続で配置が揺れない: " + heights.join(","));
    report("PASS 通常候補: 開始・欠落・発話・再接続・旧run遅着・配置安定");

    // 本文保護と、終了後の発話通知による表示の巻き戻り防止。
    second.result("追加の途中", false); await delay();
    await click(".voice-input-stop");
    expect(label() === "終了処理中", "本人終了");
    second.onspeechstart?.(); second.onspeechend?.(); second.onstart?.(); await delay();
    expect(label() === "終了処理中", "終了待ち中の遅着");
    second.result("追加の確定", true); await delay();
    await until(() => label() === "音声入力を終了しました", "最終待機完了");
    expect(!detail().includes("0件") && textarea().value.includes("追加の確定") && !textarea().value.includes("追加の途中"), "後着確定文字の置換");
    second.onspeechstart?.(); second.onend?.(); await delay();
    expect(label() === "音声入力を終了しました", "完了後の遅着");
    report("PASS 通常候補: 本人終了・遅着抑止・未確定文字保持と後着確定置換");

    // 今回の文字が0件でも、既存本文を消さず案内する。
    const preservedText = textarea().value;
    await click(".voice-input-start");
    const third = Recognition.instances[2]; third.onstart?.(); await delay();
    second.onerror?.({ error: "network" }); second.onspeechstart?.(); await delay();
    expect(label() === "音声入力を開始しました", "前セッションを混ぜない");
    offset += 150100; testClock.limitTick?.(); await delay();
    expect(host.querySelector(".voice-input-status")?.textContent?.includes("残り30秒"), "残り30秒案内維持");
    offset += 30000; testClock.limitTick?.(); await delay();
    expect(label() === "終了処理中", "上限終了処理");
    third.onspeechstart?.(); third.onspeechend?.(); await delay();
    expect(label() === "終了処理中", "上限後の遅着");
    await until(() => label() === "音声入力を終了しました", "上限の最終待機");
    expect(detail().includes("今回の認識文字は0件") && textarea().value === preservedText, "今回0件は既存本文と別");
    report("PASS 通常候補: 時刻を進めた30秒案内・3分終了・今回0件・既存本文保護");

    await click(".voice-input-start");
    const fourth = Recognition.instances[3]; fourth.onstart?.(); await delay();
    fourth.onerror?.({ error: "no-speech" }); await delay();
    expect(detail().includes("no-speech"), "実エラー案内");
    fourth.onend?.(); await delay();
    expect(label() === "接続中", "no-speech後も既存再開");
    await until(() => Recognition.instances.length === 5, "エラー後の再開");
    const fifth = Recognition.instances[4]; fifth.onstart?.(); await delay();
    fifth.onerror?.({ error: "network" }); await delay();
    expect(label() === "音声認識からエラーの通知" && detail().includes("network"), "通信エラー案内維持");
    fifth.onspeechstart?.(); await delay();
    expect(label() === "音声認識からエラーの通知", "異常終了後も戻らない");
    expect(microphoneCalls === 0 && audioContextCalls === 0, "表示は追加マイク・解析を一度も呼ばない");
    expect(!host.querySelector(".voice-wave-bars"), "波形を表示しない");
    report("PASS 通常候補: 実エラー・自動再開・終了後抑止・追加マイクと解析0回");
    // 状態表示を有効にした通常Appで、手修正・正式保存と下書き再読込を確認する。
    const finalText = textarea().value + "手修正。";
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea(), finalText);
    textarea().dispatchEvent(new Event("input", { bubbles: true })); await delay();
    expect(textarea().value === finalText, "終了後の手修正");
    host.querySelector<HTMLFormElement>("form.composer")!.requestSubmit();
    await until(() => textarea().value === "", "正式保存後の入力欄");
    const records = await db.logs.toArray();
    expect(records.length === 1 && records[0].text === finalText, "手修正を含めて正式保存");
    const drafts = await db.composerDrafts.toArray();
    expect(!drafts.some(row => row.state === "active" && row.content?.text === finalText), "保存済み内容を下書きへ残さない");
    report("PASS 通常候補: 終了後の手修正・正式保存・保存済み下書き消去");
    await click(".voice-input-start");
    const last = Recognition.instances[Recognition.instances.length - 1]; last.onstart?.(); last.result("復元する音声文字。", true); await delay();
    await click(".voice-input-stop");
    await until(() => label() === "音声入力を終了しました", "復元対象の音声終了");
    root.unmount(); await delay(1700);
    root = createRoot(host); root.render(<App database={db} enableVoiceInput />);
    await until(() => textarea()?.value === "復元する音声文字。", "音声下書きの再読込");
    expect((await db.logs.toArray()).length === 1, "未保存下書きを正式記録と混ぜない");
    report("PASS 通常候補: 音声入力後の下書き再読込・正式記録の分離");
    await click(".voice-input-start");
    Recognition.instances[Recognition.instances.length - 1].onstart?.(); await delay();
    snapshot = host.cloneNode(true);
    await click(".voice-input-stop");
    await until(() => label() === "音声入力を終了しました", "見本の終了");
    root.unmount(); await delay(1700);
    root = createRoot(host); root.render(<App database={db} />);
    await until(() => !!textarea(), "音声無効経路");
    expect(!host.querySelector(".voice-input-panel, .voice-event-status"), "音声無効時は欄を増やさない");
    expect(microphoneCalls === 0 && audioContextCalls === 0, "全操作を通じて追加マイク・解析0回");
    report("PASS 音声無効経路: 状態欄なし / 全操作の追加マイク・解析0回");
  }
  report("voice-status-candidate: 7/7 passed / viewport " + window.innerWidth);
  output.dataset.status = "passed";
} catch (error) {
  report(error instanceof Error ? error.stack ?? error.message : String(error));
  output.dataset.status = "failed";
} finally {
  root.unmount();
  // unmount の終了待機と下書き保存が終わるまで、代役と専用DBを維持する。
  await delay(1700);
  db.close(); await Dexie.delete(dbName);
  for (const [target, key, descriptor] of originals.reverse()) {
    if (descriptor) Object.defineProperty(target, key, descriptor); else Reflect.deleteProperty(target, key);
  }
  if (snapshot) {
    const fixture = snapshot as HTMLElement;
    fixture.removeAttribute("id"); fixture.inert = true;
    host.append(fixture);
  }
  output.dataset.complete = "true";
}
