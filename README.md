# WebP Image Paster

[日本語README](README_JA.md)

VSCode extension that converts clipboard images to WebP format and pastes them directly into Markdown files.
(As a secondary feature, copied URLs are pasted with their page titles.)

![image-20251109T003621.webp](img/image-20251109T003621.webp)

## Purpose and Features

- **Reduce file sizes** - Smaller than PNG, with lossless compression support
- **Customize paste patterns** - HTML tag insertion for 50% scaled images, etc.
- **Unique image names with timestamps**
- **Cross-platform** - Works on Windows, macOS, Linux, and remote environments (WSL, SSH, devcontainer)
- **Complete URL titles**

## Installation

Install from [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=hkrhd.vsc-webp-paster) or [Open VSX Registry](https://open-vsx.org/extension/hkrhd/vsc-webp-paster). No additional setup is required.

## Usage

1. Copy an image or URL to clipboard
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
  "vsc-webp-paster.progressDelay": 0.3,
  "vsc-webp-paster.convertUrlToLink": true,
  "vsc-webp-paster.urlFetchTimeout": 1500
}
```

URL conversion fetches the static HTML page title. If the title cannot be fetched within the 1-second timeout, the original URL is pasted. Set `convertUrlToLink` to `false` to paste URLs without making a request.

## 📋 Requirements

- VSCode 1.118.0 or higher
- darwin-arm64, win32-x64, linux-x64, linux-arm64

**Clipboard Access Methods:**

- **Windows**: PowerShell (.NET System.Windows.Forms.Clipboard)
- **MacOS**: AppleScript (osascript)
- **Linux**: xclip (X11) or wl-paste (Wayland) - install required
- **WSL / SSH**: Uses the client-side method above, preferring Windows PowerShell when available

## 📝 License

MIT License

## Limitations

Markdown Editor (Experimental) is not supported because it does not expose the standard Text Editor API required to insert content at the cursor position.
