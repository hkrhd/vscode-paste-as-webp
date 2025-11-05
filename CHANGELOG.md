# [0.5.0](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.4.2...v0.5.0) (2025-11-05)


### Features

* insertPattern設定の例を改善し、useWorkspaceRoot設定を追加 ([31be4de](https://github.com/hkrhd/vscode-paste-as-webp/commit/31be4de811e365e9e47bd65ecae4f8499a67d4f6))

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
