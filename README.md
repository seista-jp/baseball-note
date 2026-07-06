# Baseball Note

野球の感覚メモ用Webアプリです。メモと画像は、使っているブラウザ内の IndexedDB に保存されます。

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

## バックアップについて

GitHub Pagesで公開しても、メモの保存先はサーバーではなくブラウザ内です。
スマホや別のPCへ移すときは、アプリ内のバックアップ書き出しと読み込みを使います。
