# WebP Image Paster

[日本語版README](README_JA.md)

VSCode extension that converts clipboard images to WebP format and pastes them directly into Markdown files.

![alt text](img/image.png)

## Purpose and Features

- **Reduce file sizes** - WebP provides 25-80% smaller files than PNG/JPEG
- **Streamline workflow** - Direct paste from clipboard to Markdown
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
  "vsc-webp-paster.imagePath": "img",
  "vsc-webp-paster.quality": 80,
  "vsc-webp-paster.namingConvention": "image-${timestamp}"
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

MIT License - see [LICENSE.md](LICENSE.md) file
