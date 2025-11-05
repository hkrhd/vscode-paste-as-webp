@echo off
REM VSCode拡張機能テスト環境セットアップスクリプト (Windows)
REM 開発機でVSCode拡張機能のテストを実行するために必要な設定を行います

echo VSCode拡張機能テスト環境のセットアップを開始します...

echo Windows環境を検出しました
echo ✅ Windowsでは追加のGUI依存関係は不要です

echo.
echo 🎉 セットアップが完了しました！
echo.
echo 次のステップ:
echo 1. npm install を実行して依存関係をインストール
echo 2. npm test を実行してテストを開始
echo.
echo 問題が発生した場合は、以下を確認してください:
echo - Node.js 20.x以上がインストールされている
echo - VSCodeがインストールされている
echo - Windows Defender等のセキュリティソフトが@vscode/test-electronの実行をブロックしていない

pause
