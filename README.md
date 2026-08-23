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
