# WebP Image Paster

[日本語README](README_JA.md)

VS Code extension that converts pasted images to WebP in Markdown files. Copied URLs can also be pasted as Markdown links with their page titles.

![image-20251109T003621.webp](img/image-20251109T003621.webp)

## Purpose and Features

- **Reduce file sizes** - Smaller than PNG, with lossless compression support
- **Customize paste patterns** - HTML tag insertion for 50% scaled images, etc.
- **Unique image names with timestamps**
- **Cross-platform** - Uses VS Code's paste API and workspace file API, including Remote SSH workspaces
- **Complete URL titles**

## Installation

Install from [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=hkrhd.vsc-webp-paster) or [Open VSX Registry](https://open-vsx.org/extension/hkrhd/vsc-webp-paster). No additional setup is required.

## Usage

1. Copy an image or URL to clipboard
2. Open Markdown file in VSCode
3. Press `Ctrl+V` (or `Cmd+V` on Mac)

**Alternative methods:**

- Command Palette → "Paste as WebP in MD"

On update, the extension's former default shortcut is replaced by VS Code's standard paste handling. Custom shortcuts assigned to `vsc-webp-paster.pasteAsWebpInMd` still work; using this command shows a brief migration notice once per profile, including when run from the Command Palette.

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

URL conversion fetches the static HTML page title. If the title cannot be fetched within the default 1.5-second timeout (configurable with `urlFetchTimeout`), the original URL is pasted. Set `convertUrlToLink` to `false` to paste URLs without making a request. The Markdown WebP and title-link edits are VS Code paste options; your `editor.pasteAs.preferences` setting determines their priority.

## 📋 Requirements

- Antigravity IDE's VS Code 1.107.0 API baseline or later, including [Antigravity IDE](https://antigravity.google/download), VS Code 1.107.0+, and editors with a compatible API
- darwin-arm64, win32-x64, linux-x64, linux-arm64

In a Remote SSH workspace, the extension runs on the local UI host, receives image data through VS Code's standard paste API, converts it locally with `sharp`, and saves the WebP through VS Code's workspace file API on the remote host. The standard paste keybinding is handled by VS Code and this extension only provides paste edits for Markdown documents.

## Development

Use the Node.js version in `.nvmrc`, then run `npm ci` and `npm test`. The test command includes a real Remote SSH end-to-end test using an isolated Podman container. Install and configure Podman (including a Podman machine on macOS and Windows) and OpenSSH. The test captures its VS Code test window and uses that screenshot as clipboard image data. On Linux, provide a display server such as Xvfb.
For watch mode, run the **Watch** task in VS Code. From a terminal, run
`npm run watch:esbuild` and `npm run watch:tsc` in separate terminals.

Release tools have a separate lockfile in `tools/release`. They are installed
only for releases with `npm ci --prefix tools/release`. Run
`npm run release:dry-run` from the repository root to preview a release.
The **Semantic Release** workflow also supports manual runs, which validate
the extension and preview the release without publishing. Pushes to `main`
continue to update the version and publish automatically.
To publish a VS Code Marketplace pre-release, run
`npm run publish:pre-release -- --version 0.7.6` with an unused `MAJOR.MINOR.PATCH` version.
Add `--dry-run` to create a VSIX in `dist/pre-release/` without publishing.
Publishing requires `VSCE_PAT` or `vsce login`. The package targets the current
OS and CPU, so run it with the same version on each supported platform.
Choose a version that will not collide with the next stable release.
Dependabot opens pull requests for security fixes only, for both dependency sets.

## 📝 License

MIT License

## Limitations

Markdown Editor (Experimental) is not supported because it does not expose the standard Text Editor API required to insert content at the cursor position.
