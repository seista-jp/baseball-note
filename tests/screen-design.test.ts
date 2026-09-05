import { extractAnalysisExcerpt, extractAnalysisHighlights } from "../src/App";

const output = document.querySelector<HTMLPreElement>("#results")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }

button.addEventListener("click", () => {
  try {
    const detailed = "【一番の気づき】\n力を抜くと前へ運べた\n\n【次に試すこと】\n最初の3球は力を抜く";
    const highlights = extractAnalysisHighlights(detailed);
    assert(highlights?.insight === "力を抜くと前へ運べた", "一番の気づきを読めません");
    assert(highlights?.nextStep === "最初の3球は力を抜く", "次に試すことを読めません");
    assert(extractAnalysisExcerpt(detailed) === "力を抜くと前へ運べた", "一覧に見出しが残っています");
    assert(extractAnalysisExcerpt("\n振り返りの本文\n次の行") === "振り返りの本文", "見出しがない本文を読めません");
    output.textContent = "2/2 成功\n見出しの本文表示と、本人操作用の次に試すことを確認しました。";
  } catch (error) {
    output.textContent = `失敗: ${error instanceof Error ? error.message : String(error)}`;
  }
});
