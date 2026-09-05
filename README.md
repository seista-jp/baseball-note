# Baseball Note

野球の感覚メモ用Webアプリです。メモ、画像、外部AIで得た分析結果は、使っているブラウザ内の IndexedDB に保存されます。

## ローカルで確認する

```bash
npm install
npm run dev
```

## GitHub Pagesで公開する

1. GitHubで新しいリポジトリを作る
2. この `remote-app` フォルダの中身を、そのリポジトリにpushする
3. GitHubのリポジトリ画面で `Settings` を開く
4. 左メニューの `Pages` を開く
5. `Build and deployment` の `Source` を `GitHub Actions` にする
6. `main` ブランチへpushすると、自動でビルドと公開が走る

公開後のURLは、GitHubの `Settings` → `Pages` に表示されます。

現在の公式公開URLは [https://seista-jp.github.io/baseball-note/](https://seista-jp.github.io/baseball-note/) です。「安全とデータについて」は [https://seista-jp.github.io/baseball-note/#safety](https://seista-jp.github.io/baseball-note/#safety) から直接開けます。

## バックアップについて

GitHub Pagesで公開しても、メモとAI分析の保存先はサーバーではなくブラウザ内です。
スマホや別のPCへ移すときは、メニューの「データを保存」でJSONファイルを書き出します。移動先で先にBaseball Noteを開き、「データを戻す」から保存したJSONファイルを選びます。JSONファイルは記録データであり、JSONだけでアプリを起動することはできません。

アプリ内では、保存前にバックアップファイルの役割、保存される件数、最後に保存した日時を表示します。読み込み前には、同じ記録が上書きされ、それ以外は追加されることを案内します。

## 安全とデータについて

メモ、画像、AI分析は利用している端末内へ保存され、通常の利用で運営者へ送信されません。アカウント登録、広告、このアプリ独自のアクセス解析はありません。詳しい説明、プライバシーポリシー、利用規約、問い合わせ先は、アプリ内の「安全とデータについて」で確認できます。

## 新規メモの書きかけ保護

本文・タグ・添付画像は、入力した日付と一緒に自動保存されます。「書きかけを自動保存しました」が表示された後、同じブラウザ・同じURLで開き直すと復元されます。画像の準備中や自動保存中は画面を閉じないでください。

正式な「保存」が成功した場合、または「書きかけを破棄」→「破棄する」で確認した場合に、その下書き内容が消えます。保存中の追加入力は残ります。別の日付を閲覧しても書きかけの日付は変わりません。

複数タブの更新が重なった場合は上書きせず別の書きかけとして保護します。「ほかの書きかけを確認」から開けます。下書きはバックアップに含まれないため、端末を移す前に正式保存してください。

## 今回のローカルプレビューとテスト

`remote-app` フォルダで以下を実行します。依存関係が導入済みなら再インストール不要です。

```bash
npm run dev -- --host 127.0.0.1 --port 43188 --strictPort
```

- プレビュー: [http://127.0.0.1:43188/](http://127.0.0.1:43188/)
- テスト: [http://127.0.0.1:43188/tests/drafts.html](http://127.0.0.1:43188/tests/drafts.html) を開いて「テストを実行」。専用のランダムなDB名 `baseball-note-draft-test-*` だけを作成・削除し、普段の記録には触れません。
- ビルドと型チェック: `npm run build`
- テストコードの型チェック: `node node_modules/typescript/bin/tsc --noEmit --target ES2020 --module ESNext --moduleResolution Bundler --lib ES2020,DOM --strict --skipLibCheck tests/drafts.test.ts`

テスト画面は開発時だけ使い、通常のビルド成果物には含まれません。このローカルURLと公開URLのデータは別です。URLのホスト名やポートを変えると保存領域も別になるため、開き直すときは同じURLを使用してください。
