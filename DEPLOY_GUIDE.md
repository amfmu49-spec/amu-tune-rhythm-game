# 🚀 AMU TUNE 本番リリース・デプロイ完全ガイド (完全無料 ＆ セキュリティ安全)

このガイドに従うだけで、**PCを閉じても24時間世界中どこからでも無料で遊べる本番環境**が完成します！

---

## 📦 構成概要

| コンポーネント | 無料サービス | 理由 |
| :--- | :--- | :--- |
| **フロントエンド (ゲーム画面)** | **GitHub Pages** | 完全無料、HTTPS標準対応、DoS保護、更新がGit pushで自動化 |
| **バックエンド (CORSプロキシ)** | **Cloudflare Workers** | 毎日10万リクエストまで完全無料。世界最大のCDNで超高速＆不正使用防止フィルター付き |

---

## 🛠️ STEP 1: Cloudflare Workers で無料プロキシを起動 (所要時間: 2分)

1. **[Cloudflare](https://dash.cloudflare.com/sign-up)** の無料アカウントを作成してログインします。
2. 左メニューの **[Workers & Pages]** ➔ **[作成 (Create Application)]** ➔ **[Worker を作成]** をクリックします。
3. 名前（例: `amu-tune-proxy`）をそのままにして **[デプロイ (Deploy)]** を押します。
4. **[コードを編集 (Edit Code)]** をクリックします。
5. 画面左側のコードを全消去し、このプロジェクト内にある **`cloudflare-worker.js`** の内容をそのまま貼り付けます。
6. 右上の **[保存してデプロイ (Save and deploy)]** を押します。
7. 表示されたURL（例: `https://amu-tune-proxy.YOUR-NAME.workers.dev`）をコピーします！

---

## 🌐 STEP 2: `app.js` のプロキシURLを差し替える

`js/app.js` の 170行目付近にある `fetchWithProxy` 内の自前プロキシURLを、上記で取得した Cloudflare Worker のURLに差し替えます：

```javascript
// js/app.js
const proxies = [
    // Cloudflare Workers 本番プロキシ
    target => `https://amu-tune-proxy.YOUR-NAME.workers.dev/?url=${encodeURIComponent(target)}`,
    // ローカルテスト用フォールバック
    target => `/proxy?url=${encodeURIComponent(target)}`,
];
```

---

## 🐙 STEP 3: GitHub Pages でゲームを無料公開 (所要時間: 1分)

1. **[GitHub](https://github.com/new)** で新しい公開リポジトリ（例: `amu-tune-rhythm-game`）を作成します。
2. このプロジェクトのディレクトリで以下のコマンドを実行してコードを送信します：

```bash
git init
git add .
git commit -m "Deploy AMU TUNE production version"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/amu-tune-rhythm-game.git
git push -u origin main
```

3. GitHubのリポジトリ画面で **[Settings]** ➔ **[Pages]** を開きます。
4. **Source** を `GitHub Actions` に設定します。
5. 約1分後に `https://YOUR-USERNAME.github.io/amu-tune-rhythm-game` という専用の公開URLが自動発行されます！🎉

---

## 🎮 これで完成！
* これで世界中誰でも `https://YOUR-USERNAME.github.io/amu-tune-rhythm-game` にアクセスして遊べるようになります！
* Sunoでブックマークレットを実行すれば、自動的にこの本番URLにジャンプしてゲームが開始されます！
