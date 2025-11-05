#!/bin/bash

# VSCode拡張機能テスト環境セットアップスクリプト
# 開発機でVSCode拡張機能のテストを実行するために必要なGUI依存関係をインストールします

set -e

echo "VSCode拡張機能テスト環境のセットアップを開始します..."

# OSの検出
if [[ $OSTYPE == "linux-gnu"* ]]; then
  echo "Linux環境を検出しました"

  # Ubuntuベースのディストリビューション
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt-getを使用してパッケージをインストールします..."

    sudo apt-get update
    # Ubuntu 24.10以降のパッケージ名に対応
    sudo apt-get install -y \
      libnss3 \
      libatk1.0-0t64 \
      libatk-bridge2.0-0t64 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libgbm1 \
      libgtk-3-0t64 \
      libx11-xcb1 \
      libxss1 \
      libasound2t64 \
      libxtst6 \
      libxcursor1 \
      libxi6 \
      xvfb \
      dbus-x11 ||
      # フォールバック: 古いパッケージ名も試行
      sudo apt-get install -y \
        libnss3 \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libdrm2 \
        libxkbcommon0 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libgbm1 \
        libgtk-3-0 \
        libx11-xcb1 \
        libxss1 \
        libasound2 \
        libxtst6 \
        libxcursor1 \
        libxi6 \
        xvfb \
        dbus-x11

    echo "✅ Linux依存関係のインストールが完了しました"

  # CentOS/RHEL/Fedoraベースのディストリビューション
  elif command -v yum >/dev/null 2>&1 || command -v dnf >/dev/null 2>&1; then
    echo "yum/dnfを使用してパッケージをインストールします..."

    if command -v dnf >/dev/null 2>&1; then
      PKG_MANAGER="dnf"
    else
      PKG_MANAGER="yum"
    fi

    sudo $PKG_MANAGER install -y \
      nss \
      atk \
      at-spi2-atk \
      libdrm \
      libxkbcommon \
      libXcomposite \
      libXdamage \
      libXrandr \
      mesa-libgbm \
      gtk3 \
      libX11-xcb \
      libXScrnSaver \
      alsa-lib \
      libXtst \
      libXcursor \
      libXi \
      xorg-x11-server-Xvfb \
      dbus-x11

    echo "✅ Linux依存関係のインストールが完了しました"
  else
    echo "⚠️  サポートされていないLinuxディストリビューションです"
    echo "手動で以下のパッケージをインストールしてください:"
    echo "- NSS (Network Security Services)"
    echo "- ATK (Accessibility Toolkit)"
    echo "- GTK3"
    echo "- X11関連ライブラリ"
    echo "- Xvfb"
    echo "- D-Bus"
  fi

elif [[ $OSTYPE == "darwin"* ]]; then
  echo "macOS環境を検出しました"
  echo "✅ macOSでは追加の依存関係は不要です"

elif [[ $OSTYPE == "msys" ]] || [[ $OSTYPE == "cygwin" ]]; then
  echo "Windows環境を検出しました"
  echo "✅ Windowsでは追加の依存関係は不要です"

else
  echo "⚠️  不明なOS環境です: $OSTYPE"
  echo "手動でGUI依存関係をインストールしてください"
fi

echo ""
echo "🎉 セットアップが完了しました！"
echo ""
echo "次のステップ:"
echo "1. npm install を実行して依存関係をインストール"
echo "2. npm test を実行してテストを開始"
echo ""
echo "問題が発生した場合は、以下を確認してください:"
echo "- DISPLAY環境変数が設定されている"
echo "- X11転送が有効になっている（SSH経由の場合）"
echo "- 仮想ディスプレイ（Xvfb）が利用可能"
