import Dexie from "dexie";
import { createDatabase, type BaseballDatabase } from "../src/db";
import { ComposerDraft, createDraftId } from "../src/drafts";
import { buildBackupFile, validateBackup } from "../src/backup";
import type { LogEntry } from "../src/types";

const output = document.querySelector<HTMLPreElement>("#results")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
function assert(value: unknown, message = "検証失敗"): asserts value {
  if (!value) throw new Error(message);
}
function equal(a: unknown, b: unknown) { assert(JSON.stringify(a) === JSON.stringify(b)); }
const tests: Array<[string, (db: BaseballDatabase) => Promise<void>]> = [];
function test(name: string, run: (db: BaseballDatabase) => Promise<void>) { tests.push([name, run]); }
async function session(db: BaseballDatabase, text?: string) {
  const draft = new ComposerDraft(db, "2026-09-05");
  await draft.start();
  if (text !== undefined) { draft.update({ text }); await draft.settled(); }
  return draft;
}
async function active(db: BaseballDatabase) { return db.composerDrafts.where("state").equals("active").toArray(); }
const picture = () => ({id: "image-test", name: "test.jpg", type: "image/jpeg", createdAt: "2026-09-01T00:00:00.000Z", blob: new Blob([new Uint8Array([255,216,255,217])], {type: "image/jpeg"})});

 test("安全でない開発用URLでも下書きIDを作れる", async () => {
  const first = createDraftId(null);
  const second = createDraftId(null);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(first));
  assert(first !== second, "下書きIDが重複しています");
 });
 test("本文・過去日・タグ・画像が次回起動で復元され、正式記録にはならない", async db => {
  const d = await session(db);
  d.update({date: "2026-09-01", text: "調査用：力が入った", tags: ["打撃", "体調"], images: [picture()]});
  await d.settled();
  const next = await session(db);
  equal({...next.getSnapshot().content, images: []}, {...d.getSnapshot().content, images: []});
  const image = next.getSnapshot().content.images[0];
  assert(image.blob instanceof Blob && image.blob.size === 4 && image.name === "test.jpg");
  assert(next.getSnapshot().notice.includes("復元"));
  assert(await db.logs.count() === 0);
 });
 test("保存成功は下書き本文・画像を消し、再起動でも再出現しない", async db => {
  const d = await session(db, "保存テスト");
  d.update({images: [picture()]}); await d.settled();
  assert(await d.save());
  assert(await db.logs.count() === 1 && (await active(db)).length === 0);
  assert(!(await db.composerDrafts.toArray())[0].content);
  assert((await session(db)).getSnapshot().content.text === "");
 });
 test("思い出すヒントは本文やタグを変えず、下書きと一緒に復元される", async db => {
  const d = await session(db, "自分の言葉で書いた本文");
  d.update({tags: ["打撃"], wordHints: {words: ["タイミング", "脱力"]}}); await d.settled();
  const next = await session(db);
  assert(next.getSnapshot().content.text === "自分の言葉で書いた本文");
  equal(next.getSnapshot().content.tags, ["打撃"]);
  equal(next.getSnapshot().content.wordHints.words, ["タイミング", "脱力"]);
  assert(await db.logs.count() === 0);
 });
 test("ヒントだけでは正式記録を作らず、保存成功時に選択を消す", async db => {
  const d = await session(db);
  d.update({wordHints: {words: ["軸"]}}); await d.settled();
  assert(await d.save() === null && await db.logs.count() === 0);
  d.update({text: "本文を追加"}); await d.settled();
  assert(await d.save());
  equal(d.getSnapshot().content.wordHints.words, []);
  assert((await session(db)).getSnapshot().content.wordHints.words.length === 0);
 });
 test("古い下書きにヒント項目がなくても安全に復元する", async db => {
  await db.composerDrafts.add({id: "old-draft", revision: 1, updatedAt: new Date().toISOString(), state: "active", content: {date: "2026-09-05", text: "旧下書き", tags: [], images: []} as never});
  const d = await session(db);
  assert(d.getSnapshot().content.text === "旧下書き");
  equal(d.getSnapshot().content.wordHints.words, []);
 });
 test("保存失敗では本文・画像・ヒント・下書きを保持し、成功時にヒントを消す", async db => {
  const d = await session(db, "失敗でも残る");
  d.update({images:[picture()], wordHints: {words: ["タイミング", "軸"], prompt: "うまくいかなかった場面", activity: "打つ"}}); await d.settled();
  const fail = () => { throw new DOMException("test quota", "QuotaExceededError"); };
  db.logs.hook("creating", fail);
  assert(await d.save() === null);
  assert(d.getSnapshot().error.includes("保存容量が不足"));
  assert(d.getSnapshot().content.text === "失敗でも残る");
  equal(d.getSnapshot().content.wordHints.words, ["タイミング", "軸"]);
  assert((await active(db))[0].content?.images[0].blob.size === 4);
  assert(await db.logs.count() === 0);
  db.logs.hook("creating").unsubscribe(fail);
  assert(await d.save());
  equal(d.getSnapshot().content.wordHints.words, []);
 });
 test("下書き消去段階の失敗でも正式記録を残さず二重登録を防ぐ", async db => {
  const d = await session(db, "一括保存");
  const fail = (changes: object) => { if ("state" in changes) throw new Error("test failure"); };
  db.composerDrafts.hook("updating", fail);
  assert(await d.save() === null);
  assert(await db.logs.count() === 0 && (await active(db)).length === 1);
  db.composerDrafts.hook("updating").unsubscribe(fail);
  assert(await d.save());
  assert(await db.logs.count() === 1);
 });
 test("保存中の追加入力・タグ変更・画像取り消しが次の下書きとして残る", async db => {
  const d = await session(db, "保存する本文");
  d.update({images: [picture()], tags:["打撃"]}); await d.settled();
  const saving = d.save();
  d.update({text: "保存する本文＋追加入力", tags: ["投球"], images: []});
  const entry = await saving;
  await d.settled();
  assert(entry?.text === "保存する本文" && entry.images.length === 1);
  assert(d.getSnapshot().content.text.endsWith("追加入力"));
  const next = await session(db);
  equal(next.getSnapshot().content.tags, ["投球"]);
  assert(next.getSnapshot().content.images.length === 0);
  assert(next.getSnapshot().content.text.endsWith("追加入力"));
  assert(await db.logs.count() === 1);
 });
 test("保存ボタンの連打で正式記録が重複しない", async db => {
  const d = await session(db, "連打");
  await Promise.all([d.save(), d.save(), d.save()]);
  assert(await db.logs.count() === 1);
 });
 test("破棄時にヒントも消え、保存済みメモ・AI分析は維持", async db => {
  const d = await session(db, "正式記録"); await d.save();
  await db.aiAnalyses.add({id:"ai-test",startDate:"2026-09-01",endDate:"2026-09-05",tag:"すべて",text:"分析",createdAt:new Date().toISOString()});
  d.update({text: "破棄する本文", images:[picture()], wordHints: {words: ["脱力"], prompt: "引き続き意識していること", activity: "投げる"}}); await d.settled();
  assert(await d.discard());
  assert((await session(db)).getSnapshot().content.text === "");
  equal((await session(db)).getSnapshot().content.wordHints.words, []);
  assert(await db.logs.count() === 1 && await db.aiAnalyses.count() === 1);
  assert((await active(db)).length === 0);
 });
 test("下書き保存失敗を通知し、現在の入力を保持。再試行で復旧", async db => {
  const d = await session(db);
  const fail = () => { throw new DOMException("test", "QuotaExceededError"); };
  db.composerDrafts.hook("creating", fail);
  d.update({text: "失敗した下書き"}); await d.settled();
  assert(d.getSnapshot().error && d.getSnapshot().content.text === "失敗した下書き");
  assert((await active(db)).length === 0);
  db.composerDrafts.hook("creating").unsubscribe(fail);
  d.retry(); await d.settled();
  assert(!d.getSnapshot().error && (await session(db)).getSnapshot().content.text === "失敗した下書き");
 });
 test("複数タブの同時編集は別下書きに分かれ、双方を保持", async db => {
  const a = await session(db, "共通本文");
  const b = await session(db);
  a.update({text: "タブAの新しい入力"}); b.update({text: "タブBの入力"});
  await Promise.all([a.settled(), b.settled()]);
  const rows = await active(db);
  equal(rows.map(r=>r.content?.text).sort(), ["タブAの新しい入力", "タブBの入力"].sort());
  assert(a.getSnapshot().notice.includes("別の") || b.getSnapshot().notice.includes("別の"));
  await b.refresh(); assert(b.getSnapshot().alternatives.length === 1);
  await b.open(b.getSnapshot().alternatives[0].id);
  assert(b.getSnapshot().content.text === "タブAの新しい入力");
 });
 test("別タブで保存済みの下書きを再保存しても重複しない", async db => {
  const a = await session(db, "同じ記録"); const b = await session(db);
  await Promise.all([a.save(), b.save()]);
  assert(await db.logs.count() === 1 && (await active(db)).length === 0);
  assert((await session(db)).getSnapshot().content.text === "");
 });
 test("古いタブの保存と破棄で、新しいタブの下書きを上書きしない", async db => {
  const a = await session(db, "共通"); const b = await session(db);
  a.update({text:"新しい本文"}); await a.settled();
  assert(await b.save() === null && b.getSnapshot().error);
  assert(!await b.discard());
  assert((await active(db))[0].content?.text === "新しい本文");
  assert(await db.logs.count() === 0);
 });
 test("自動保存に失敗した追加入力を、他タブ保存済み判定で消さない", async db => {
  const a=await session(db,"元本文"); const b=await session(db);
  const fail=()=>{throw new Error("一時的な書き込み失敗");};
  db.composerDrafts.hook("updating",fail);
  b.update({text:"未保護の追加入力"}); await b.settled();
  assert(b.getSnapshot().error);
  db.composerDrafts.hook("updating").unsubscribe(fail);
  assert(await a.save());
  const saved=await b.save();
  assert(saved?.text === "未保護の追加入力");
  equal((await db.logs.toArray()).map(l=>l.text).sort(),["元本文","未保護の追加入力"].sort());
 });
 test("別タブで破棄された下書きを古いタブが正式保存しない", async db => {
  const a = await session(db,"破棄対象"); const b = await session(db);
  await a.discard(); assert(await b.save() === null);
  assert(await db.logs.count() === 0 && (await active(db)).length === 0);
 });
 test("旧v2 DBのメモ・画像・AI分析を保持してv3に更新", async db => {
  const name=db.name; db.close();
  await Dexie.delete(name);
  const old = new Dexie(name);
  old.version(1).stores({logs:"id, date, createdAt"});
  old.version(2).stores({aiAnalyses:"id, createdAt"});
  const entry: LogEntry={id:"old-log",date:"2026-09-01",createdAt:new Date().toISOString(),text:"旧記録",tags:["打撃"],images:[picture()]};
  await old.table("logs").add(entry);
  await old.table("aiAnalyses").add({id:"old-ai",startDate:"2026-09-01",endDate:"2026-09-05",createdAt:entry.createdAt,tag:"打撃",text:"旧分析"});
  old.close(); await db.open();
  assert((await db.logs.get("old-log"))?.images[0].blob.size === 4);
  assert((await db.aiAnalyses.get("old-ai"))?.text === "旧分析");
  await session(db,"新下書き"); assert((await active(db)).length === 1);
 });
 test("既存メモの編集・検索・v2画像付きバックアップ往復・v1互換", async db => {
  const d = await session(db,"元本文"); d.update({images:[picture()],tags:["打撃"]}); await d.settled();
  const entry = await d.save(); assert(entry);
  await db.logs.update(entry.id,{text:"編集済み"});
  const logs=await db.logs.toArray(); assert(logs.filter(l=>l.text.includes("編集")).length===1);
  const backupLogs=await Promise.all(logs.map(async log=>({...log,images:await Promise.all(log.images.map(async image=>({id:image.id,name:image.name,type:image.type,createdAt:image.createdAt,dataUrl:await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(image.blob);})})))})));
  const backup=validateBackup(JSON.parse(JSON.stringify(buildBackupFile(backupLogs,[]))));
  const restored=await Promise.all(backup.logs.map(async log=>({...log,images:await Promise.all(log.images.map(async image=>({id:image.id,name:image.name,type:image.type,createdAt:image.createdAt,blob:await (await fetch(image.dataUrl)).blob()})))})));
  await db.transaction("rw",db.logs,db.aiAnalyses,async()=>{await db.logs.bulkPut(restored);await db.aiAnalyses.bulkPut(backup.aiAnalyses);});
  assert(await db.logs.count()===1 && (await db.logs.get(entry.id))?.images[0].blob.size===4);
  const v1=validateBackup({version:1,logs:[{id:"v1",date:entry.date,createdAt:entry.createdAt,text:"古い形式"}]});
  equal(v1.logs[0].images,[]);equal(v1.logs[0].tags,[]);equal(v1.aiAnalyses,[]);
  assert(!("composerDrafts" in backup));
  let rejected=false;try{validateBackup({version:2,logs:[...backup.logs,...backup.logs],aiAnalyses:[]});}catch{rejected=true;}assert(rejected);
 });

button.addEventListener("click", async () => {
  button.disabled = true; output.textContent = "実行中…\n";
  let passed=0;
  for (const [name, run] of tests) {
    const db=createDatabase(`baseball-note-draft-test-${crypto.randomUUID()}`);
    try { await run(db); output.textContent += `PASS ${name}\n`; passed++; }
    catch(error) { output.textContent += `FAIL ${name}: ${error instanceof Error ? error.stack : String(error)}\n`; }
    finally { db.close(); await Dexie.delete(db.name); }
  }
  output.textContent += `\n${passed}/${tests.length} 成功`;
  button.disabled=false;
});
