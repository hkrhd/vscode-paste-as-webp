## [1.0.2](https://github.com/hkrhd/vscode-paste-as-webp/compare/v1.0.1...v1.0.2) (2025-11-04)


### Bug Fixes

* SSHリモート環境でのクリップボード処理とWindows検出ロジックを改善 ([39e72cf](https://github.com/hkrhd/vscode-paste-as-webp/commit/39e72cfd3a69d19792ce9c606cb9fa3183e960bf))

## [0.4.2](https://github.com/hkrhd/vscode-paste-as-webp/compare/v0.4.0...v0.4.2) (2025-11-04)

### Bug Fixes

- semantic-releaseでPATを使用してワークフローをトリガー ([4563ec8](https://github.com/hkrhd/vscode-paste-as-webp/commit/4563ec8f221be2230bfd88667e1d593439116195))

# 0.4.1 (2025-11-04)

### Features

- semantic-releaseを設定 ([79d73e0](https://github.com/hkrhd/vscode-paste-as-webp/commit/79d73e0410319514e5252e52124d19209d56c382))

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
