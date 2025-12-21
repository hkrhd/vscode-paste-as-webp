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

- VSCode 1.73.0 or higher
- darwin-arm64, win32-x64, linux-x64, linux-arm64

**Clipboard Access Methods:**

- **Windows**: PowerShell (.NET System.Windows.Forms.Clipboard)
- **macOS**: AppleScript (osascript)
- **Linux**: xclip (X11) or wl-paste (Wayland) - install required

## 📝 License

MIT License
