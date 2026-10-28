# WebP Image Paster

[English README](README.md)

クリップボード画像をWebP形式に変換し, Markdownファイルに直接貼り付けるVSCode拡張機能です。
（サブ機能として中身がURLの場合は，タイトル補完してペースト）

![image-20251109T003621.webp](img/image-20251109T003621.webp)

## 目的,機能

- **ファイルサイズ削減** - PNGより小さく．ロスレス対応
- **貼り付けパターンのカスタマイズ** - htmlタグを使った50%縮小貼り付けなど
- **画像名に日時を入れてユニークに**
- **クロスプラットフォーム動作** - Windows、macOS、Linux，リモート(WSL、ssh、devcontainer)
- **URLタイトル補完**

## インストール

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=hkrhd.vsc-webp-paster) または [Open VSX Registry](https://open-vsx.org/extension/hkrhd/vsc-webp-paster) からインストールできます（追加セットアップ不要）。

## 使い方

1. 画像またはURLをクリップボードにコピー
2. VSCodeでMarkdownファイルを開く
3. `Ctrl+V`（MacではCmd+V）を押す

**その他の方法:**

- コマンドパレット → "Paste as WebP in MD"

## ⚙️ 設定

詳細は設定の説明文を参照

```json
{
  "vsc-webp-paster.imageDir": "img",
  "vsc-webp-paster.quality": 80,
  "vsc-webp-paster.namingConvention": "image-${timestamp}",
  "vsc-webp-paster.insertPattern": "![${fileName}](${relativePath})",
  "vsc-webp-paster.useWorkspaceRoot": false,
  "vsc-webp-paster.progressDelay": 0.3,
  "vsc-webp-paster.convertUrlToLink": true,
  "vsc-webp-paster.urlFetchTimeout": 1500
}
```

URL変換では静的HTMLのページタイトルを取得します．既定1.5秒のタイムアウト（`urlFetchTimeout`で変更可能）までに取得できない場合は元のURLを貼り付けます．通信せずURLをそのまま貼り付ける場合は `convertUrlToLink` を `false` にします．

## 📋 要件

- VSCode 1.100.0以上（または同バージョンの拡張APIに対応するVSCode系エディタ）
- darwin-arm64, win32-x64, linux-x64, linux-arm64

Remote SSH では拡張を手元のUIホストで動かし、標準Paste APIで受け取った画像を `sharp` でローカル変換し、VS CodeのワークスペースファイルAPIでSSH先に保存します。標準貼り付けキーは VS Code が処理し、この拡張は Markdown ファイルにだけ貼り付け候補を提供します。WebP画像とタイトル付きリンクの優先順位には `editor.pasteAs.preferences` の設定が使われます。

## 開発

`.nvmrc` の Node.js を使い、`npm ci`、`npm test` を実行します。テストには Podman コンテナを使う実SSHエンドツーエンドテストが含まれます。Podman とOpenSSHクライアントをインストールして設定してください（macOS/Windows はPodman machineが必要です）。テストはVS Codeのテストウィンドウを撮影して画像クリップボードへ設定します。LinuxではXvfbなどの画面サーバーを使用してください。
監視ビルドは VS Code の **Watch** タスクで起動します。ターミナルでは
`npm run watch:esbuild` と `npm run watch:tsc` を別々に起動します。

リリース用ツールは `tools/release` の独立した lockfile で管理し、
リリース時だけ `npm ci --prefix tools/release` でインストールします。
リポジトリのルートで `npm run release:dry-run` を実行すると、リリース内容を確認できます。
**Semantic Release** workflow の手動実行でも拡張の検証とリリースの予行を行い、公開はしません。
`main` への push 時は、従来どおりバージョン更新と公開を自動実行します。
Dependabot の自動PRは、通常開発用・リリース用ともセキュリティ修正に限定します。

## 📝 ライセンス

MIT License

## 制限事項

Markdown Editor (Experimental) は、カーソル位置への挿入に必要な標準の Text Editor API を公開していないため、現在未対応です。
