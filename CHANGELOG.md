## [0.5.12](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.11...v0.5.12) (2025-11-09)


### Bug Fixes

* handle dynamic workflows in cleanup-runs workflow ([26da9c7](https://github.com/hkrhd/vscode-paste-as-webp/commit/26da9c7e22ccb2b7088c56d6740212a1dc0cba18))

## [0.5.11](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.10...v0.5.11) (2025-11-08)


### Bug Fixes

* update documentation and replace demo image with WebP format ([430774d](https://github.com/hkrhd/vscode-paste-as-webp/commit/430774de94f02ecb9236f4d1aa5d3e2acc7567d1))

## [0.5.10](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.9...v0.5.10) (2025-11-08)


### Bug Fixes

* notebookEditorFocusedでJupyter notebook除外 ([3f481d6](https://github.com/hkrhd/vscode-paste-as-webp/commit/3f481d6a15eee593ba13db5c22bd6d4ed14d6d59))

## [0.5.9](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.8...v0.5.9) (2025-11-08)


### Bug Fixes

* keybindings when条件の引用符追加 ([59f2d0e](https://github.com/hkrhd/vscode-paste-as-webp/commit/59f2d0e17e7830877eba65d8760160caa4fcc54d))

## [0.5.8](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.7...v0.5.8) (2025-11-07)

### Bug Fixes

- Restrict activation to .md files only to prevent activation in Jupyter notebooks ([086f6f9](https://github.com/hkrhd/vscode-paste-as-webp/commit/086f6f971c978fcc55f4f1a7ba5c77e23e5d1246))

## [0.5.7](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.6...v0.5.7) (2025-11-05)

### Bug Fixes

- MessageProvider共通化とエラー表示の多言語化対応 ([9533650](https://github.com/hkrhd/vscode-paste-as-webp/commit/9533650ff01103a123b88c11b2c0d18b196fd95a))

## [0.5.6](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.5...v0.5.6) (2025-11-05)

### Bug Fixes

- Uri基盤パス処理へ移行，WSL/Remote環境対応強化 ([83d9465](https://github.com/hkrhd/vscode-paste-as-webp/commit/83d94652d9fa7555fee3899ee173d88e4c62eb2e))

## [0.5.5](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.4...v0.5.5) (2025-11-05)

### Bug Fixes

- クリーンアップワークフローのリリース削除エラーハンドリングを改善 ([b298e75](https://github.com/hkrhd/vscode-paste-as-webp/commit/b298e75dcccbfcb26e66e1ed4ef3b0e1b58f6510))

## [0.5.4](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.3...v0.5.4) (2025-11-05)

### Bug Fixes

- クリーンアップワークフローに必要な権限を追加 ([8dec06a](https://github.com/hkrhd/vscode-paste-as-webp/commit/8dec06a028ab809ec2c50769a2eb7242cae12c13))

## [0.5.3](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.2...v0.5.3) (2025-11-05)

### Bug Fixes

- vsceビルドエラーを修正 ([04fcfc0](https://github.com/hkrhd/vscode-paste-as-webp/commit/04fcfc0459635bf94e359f1c1d6d49f28b56e5f1))

## [0.5.2](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.1...v0.5.2) (2025-11-05)

### Bug Fixes

- 画像保存失敗時にWebPエラーを通知 ([8f1f1c0](https://github.com/hkrhd/vscode-paste-as-webp/commit/8f1f1c0869af23f795714c9d30a3dc00acb18bef))

## [0.5.1](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.5.0...v0.5.1) (2025-11-05)

### Bug Fixes

- ロギング機能の統一と VSCode FileSystem API への移行 ([fb31778](https://github.com/hkrhd/vscode-paste-as-webp/commit/fb31778091621804b0741116357b2bbc95edb95d))

# [0.5.0](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.4.2...v0.5.0) (2025-11-05)

### Features

- insertPattern設定の例を改善し、useWorkspaceRoot設定を追加 ([31be4de](https://github.com/hkrhd/vscode-paste-as-webp/commit/31be4de811e365e9e47bd65ecae4f8499a67d4f6))

# [UNRELEASED]

## Features

- **config**: Add `useWorkspaceRoot` setting to control image save location base path
  - `false` (default): Save images relative to Markdown file location
  - `true`: Save images relative to workspace root (previous behavior)
  - This change improves flexibility for different project structures

## BREAKING CHANGES

- **config**: Renamed configuration `imagePath` to `imageDir` for clarity
  - Migration: Update your settings.json from `vsc-webp-paster.imagePath` to `vsc-webp-paster.imageDir`
  - Old configuration will no longer work and must be updated manually
- **behavior**: Default image save location changed from workspace root to Markdown file location
  - To restore previous behavior, set `vsc-webp-paster.useWorkspaceRoot: true` in settings.json

## [0.4.2](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.4.1...v0.4.2) (2025-11-05)

### Bug Fixes

- CHANGELOG整理とドキュメント改善 ([a98b992](https://github.com/hkrhd/vscode-paste-as-webp/commit/a98b992c60a50c9edcd9e3ecfa3be99c442cdf95))

## [0.4.1](https://github.com/hkrhd/vscode-paste-as-webp/releases/tag/v0.4.1) (2025-11-05)

### Bug Fixes

- SSH・WSL環境でのクリップボード取得動作を改善
- Linux環境でのクリップボード対応（xclip/wl-paste）
- SSHリモート環境でのクリップボード処理とWindows検出ロジックを改善

# Change Log

All notable changes to the "vsc-webp-paster" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.4.0] - 2025-11-04

### Added

- Automatic versioning with semantic-release
- GitHub Actions workflow for automated releases

## [0.2.0] - 2025-11-04

### Added

- Full remote development support (WSL, Remote SSH, DevContainer)
- Hybrid extension mode (`extensionKind: ["ui", "workspace"]`) for flexible local/remote execution
- Automatic remote environment detection via `vscode.env.remoteName`

### Fixed

- Sequential numbering pattern `${seq}` now generates proper filenames (e.g., `image-1.webp`, `image-2.webp`)
- WSL clipboard integration: automatically use `powershell.exe` in WSL environments
- PowerShell script execution: Base64 encoding prevents variable expansion issues in remote shells
- Progress message suppression: eliminated CLIXML output noise
- git workflow

### Changed

- PowerShell scripts now use UTF-16 LE Base64 encoding for cross-platform reliability

## [0.1.0] - 2025-10-13

### Added

- WebP image conversion with configurable quality (0-100, default: 80)
- Smart clipboard processing: images only, pass-through for other content
- Multiple paste triggers: Ctrl+V, right-click menu, command palette
- Auto file management: directory creation and configurable paths
- Flexible naming: `${timestamp}`, `${date}`, and `${seq}` patterns
- Cross-platform support: Windows, macOS, Linux, WSL, Remote SSH, DevContainer
- Markdown-only activation to avoid conflicts
- Bilingual documentation (English/Japanese)
- Configuration options:
  - `vsc-webp-paster.imagePath`: Image directory (default: "img")
  - `vsc-webp-paster.quality`: WebP quality 0-100 (default: 80)
  - `vsc-webp-paster.namingConvention`: Filename pattern (default: "image-${timestamp}")
