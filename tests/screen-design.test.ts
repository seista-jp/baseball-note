import { extractAnalysisExcerpt, extractAnalysisHighlights, focusReflectionNoticeText, saveChosenFocus } from "../src/App";

const output = document.querySelector<HTMLPreElement>("#results")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

button.addEventListener("click", () => {
  const previousFocus = window.localStorage.getItem("baseball-note-chosen-focus");
  try {
    const detailed = "【一番の気づき】\n力を抜くと前へ運べた\n\n【次に試すこと】\n最初の3球は力を抜く";
    const highlights = extractAnalysisHighlights(detailed);
    assert(highlights?.insight === "力を抜くと前へ運べた", "一番の気づきを読めません");
    assert(highlights?.nextStep === "最初の3球は力を抜く", "次に試すことを読めません");
    assert(extractAnalysisExcerpt(detailed) === "力を抜くと前へ運べた", "一覧に見出しが残っています");
    assert(extractAnalysisExcerpt("\n振り返りの本文\n次の行") === "振り返りの本文", "見出しがない本文を読めません");
    const nextStep = saveChosenFocus("最初の3球は力を抜く");
    assert(window.localStorage.getItem("baseball-note-chosen-focus") === nextStep, "意識内容を保存できません");
    assert(focusReflectionNoticeText === "記録画面の『今、一番意識していること』に反映しました", "反映案内が正しくありません");
    output.textContent = "3/3 成功\n見出しの本文表示、本人操作用の次に試すこと、意識内容の保存を確認しました。";
  } catch (error) {
    output.textContent = `失敗: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    if (previousFocus === null) window.localStorage.removeItem("baseball-note-chosen-focus");
    else window.localStorage.setItem("baseball-note-chosen-focus", previousFocus);
  }
});
