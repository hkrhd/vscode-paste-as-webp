# WebP Image Paster

[日本語README](README_JA.md)

> **Found a bug?** Please let me know by [issue](https://github.com/hkrhd/vscode-paste-as-webp/issues) I'll fix it ASAP!
> なる早で修正します！

VSCode extension that converts clipboard images to WebP format and pastes them directly into Markdown files.

![image-20251109T003621.webp](img/image-20251109T003621.webp)

## Purpose and Features

- **Reduce file sizes** - Smaller than PNG. Lossless compression supported
- **Customize paste patterns** - HTML tag insertion for 50% scaled images, etc.
- **Unique image names with timestamps**
- **Save images relative to workspace root**
- **Cross-platform** - Works on Windows, macOS, Linux, and remote environments (WSL, SSH, devcontainer)

## Installation

1. Install from VSCode Marketplace
2. No additional setup required

## Usage

1. Copy image to clipboard
2. Open Markdown file in VSCode
3. Press `Ctrl+V` (or `Cmd+V` on Mac)

**Alternative methods:**

- Command Palette → "Paste as WebP in MD"

## ⚙️ Configuration

See configuration descriptions for details

```json
{
  "vsc-webp-paster.imageDir": "img",
  "vsc-webp-paster.quality": 80,
  "vsc-webp-paster.namingConvention": "image-${timestamp}",
  "vsc-webp-paster.insertPattern": "![${fileName}](${relativePath})",
  "vsc-webp-paster.useWorkspaceRoot": false,
  "vsc-webp-paster.progressDelay": 0.3
}
```

## 📋 Requirements

- VSCode 1.108.0 or higher
- darwin-arm64, win32-x64, linux-x64, linux-arm64

**Clipboard Access Methods:**

- **Windows**: PowerShell (.NET System.Windows.Forms.Clipboard)
- **macOS**: AppleScript (osascript)
- **Linux**: xclip (X11) or wl-paste (Wayland) - install required
- **WSL / SSH**: Uses the client-side method above, preferring Windows PowerShell when available

## Development

```bash
npm ci
npm run compile
npm test
npm run test:e2e:code
npm run test:perf:e2e
npm run package:vsix
```

Local test commands:
- `npm test`: CI-compatible Extension Host E2E
- `npm run test:e2e:code`: local-only E2E using your installed VS Code via `code` CLI
- `npm run test:perf:e2e`: local-only performance E2E that prints activation and memory metrics

For VS Code debugging, launch `Run Extension` from `.vscode/launch.json`.
To run the local-only E2E suite against your installed VS Code via the `code` CLI, use `npm run test:e2e:code`.

## Release

Marketplace publishing is automated with `semantic-release`.
The `main` branch creates the GitHub Release, and the release workflow publishes the 4 supported targets to the VS Code Marketplace.

## 📝 License

MIT License
