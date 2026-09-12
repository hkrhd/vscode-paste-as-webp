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
- **Paste URLs with page titles** - Converts a copied URL into a Markdown link
- **Cross-platform** - Works on Windows, macOS, Linux, and remote environments (WSL, SSH, devcontainer)

## Installation

1. Install from VSCode Marketplace
2. No additional setup required

## Usage

1. Copy an image or URL to clipboard
2. Open Markdown file in VSCode
3. Press `Ctrl+V` (or `Cmd+V` on Mac)

A copied URL such as `https://code.visualstudio.com/` is pasted as `[Visual Studio Code](<https://code.visualstudio.com/>)`.

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
  "vsc-webp-paster.progressDelay": 0.3,
  "vsc-webp-paster.convertUrlToLink": true,
  "vsc-webp-paster.urlFetchTimeout": 1500
}
```

URL conversion fetches the static HTML page title. If the title cannot be fetched within the timeout, the original URL is pasted. Pages that set their title only with JavaScript or require sign-in are not supported. Set `convertUrlToLink` to `false` to paste URLs without making a request.

## 📋 Requirements

- VSCode 1.118.0 or higher
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
npm run test:e2e:live
npm run test:perf:e2e
npm run package:vsix
```

Local test commands:

- `npm test`: CI-compatible Extension Host E2E
- `npm run test:e2e:code`: local-only E2E using your installed VS Code via `code` CLI
- `npm run test:e2e:live`: optional live URL E2E using `https://example.com/`; pass another URL after `--` to change the target
- `npm run test:perf:e2e`: local-only performance E2E that prints activation and memory metrics

CI runs the Extension Host E2E suite against both the minimum supported VS Code version and the latest stable version. To select a downloaded VS Code version locally, set `VSCODE_TEST_VERSION` (for example, `VSCODE_TEST_VERSION=1.118.0 npm test`).

The live URL E2E makes one request without retries and is not run in CI. For example, run `npm run test:e2e:live -- https://ejje.weblio.jp/content/test` to check another site.

## Release

Marketplace publishing is automated with `semantic-release`.
The `main` branch creates the GitHub Release, and the release workflow publishes the 4 supported targets to the VS Code Marketplace.

## 📝 License

MIT License
