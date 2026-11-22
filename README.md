# OpenCode V2 Sidebar

A small VS Code extension that embeds the **official OpenCode V2 web UI** in the
**Secondary Side Bar (right side)**, alongside Copilot Chat and Claude Code —
so it does not compete with Explorer / Source Control on the left.

> This extension is not affiliated with SST. It only embeds the official
> OpenCode web UI from your locally running OpenCode v2 service.

## Requirements

- VS Code 1.94 or newer
- OpenCode v2 installed and its background service running
  ```powershell
  opencode --version     # 2.x
  opencode service status
  ```

## Install

Download `opencode-v2-sidebar-*.vsix` from the
[latest release](https://github.com/Polasie/opencode-v2-sidebar/releases/latest),
then either:

- In VS Code: **Extensions** → `...` → **Install from VSIX...**, or
- From a terminal:

```powershell
code --install-extension opencode-v2-sidebar-0.3.0.vsix
```

Reload the window when prompted. The chat view focuses automatically on
startup; it appears at the top right of the window (Secondary Side Bar).

If you previously sideloaded an older `local.opencode-v2-sidebar` build,
uninstall it first — two extensions contributing `opencodeV2.chatView` at once
will conflict.

For local development, run `.\install.ps1` instead — it copies the source into
`~/.vscode/extensions/Polasie.opencode-v2-sidebar-<version>`.

## Features

- **Auto-focus** — the OpenCode V2 view opens itself after startup.
- **Auto-reconnect** — every 15 s the extension probes `/api/info`; if the
  service restarts or its password rotates, the proxy is rebuilt and the
  iframe reloads automatically.
- **Status indicator** — green dot = connected, red dot = reconnecting or
  disconnected. **Reconnect** is still available manually.
- **Home session grouping** — sessions are grouped by project (default) or by
  directory via the `opencodeV2.groupBy` setting. `none` restores the official
  date grouping. The original UI layout, buttons and handlers are preserved.
- **Collapsible groups** — click a group header (or right-click →
  Collapse/Expand) to hide/show its sessions.
- **Pin** — right-click a group header to Pin/Unpin that project, or right-click
  a chat row to Pin/Unpin that chat. Pinned items move to the top instantly,
  marked with a small SVG pin icon. Right-click a chat → **More actions…** still
  opens the official OpenCode menu (rename/archive/delete, etc.). Pin and
  collapse state persist in the webview's localStorage.

## Commands

Available from the Command Palette (`Ctrl+Shift+P`):

- `OpenCode V2: Focus Chat`
- `OpenCode V2: Reconnect`

## How it works

1. `opencode service status` gives the local service URL.
2. `opencode service get password` gives the current service password.
3. The extension starts a loopback-only proxy on `127.0.0.1:<random port>` that
   injects `Authorization: Basic ...` into requests and streams the official
   web UI into a webview (including WebSocket upgrades).
4. For grouping/collapse/pin, the proxy patches only the official JS asset in
   memory (`ui-patch.js`). Pin ordering uses CSS `order` on the rendered rows —
   DOM nodes are never moved, so the official UI stays intact and no iframe
   reload is needed.

Nothing is sent to a third party, and no password is stored by this extension.
The proxy code lives in `proxy.js` and is covered by unit tests.

## Troubleshooting

- Red dot / blank view → run `OpenCode V2: Reconnect` or press **Reconnect**.
- Check **Output** → **OpenCode V2 Sidebar** for proxy/startup messages.
- Confirm the service is healthy with `opencode service status` and
  `opencode api get /api/info`.

## Build and test from source

```powershell
npm test
npx --yes @vscode/vsce package
```

Pushing a tag like `v0.3.0` makes GitHub Actions run the tests, package the
VSIX, and attach it to the release automatically.

## ภาษาไทย (ย่อ)

ส่วนเสริมที่ฝัง Web UI ของ OpenCode V2 ไว้ **ด้านขวา** ของ VS Code
(Secondary Side Bar) เหมือน Copilot / Claude Code ไม่ทับกับ Explorer และ Git
ต้องมี OpenCode v2 และ `opencode service` รันอยู่ ตัวต่อจะเปิดเองตอน start
และตรวจสุขภาพ service ทุก 15 วินาที ถ้า restart หรือเปลี่ยนรหัสผ่านจะ reconnect
เองอัตโนมัติ (ยังกด **Reconnect** ได้เหมือนเดิม)
หน้า Home จะจัดแชทตามโปรเจกต์/โฟลเดอร์ได้ กดหัวข้อเพื่อยุบ/ขยาย และคลิกขวาเพื่อ Pin
ทั้ง group และแชทได้ โดยไม่รบกวนปุ่มเดิมของ OpenCode

## License

MIT — see [LICENSE](LICENSE).
