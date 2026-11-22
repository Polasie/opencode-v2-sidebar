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
code --install-extension opencode-v2-sidebar-0.1.0.vsix
```

Reload the window when prompted. The **OpenCode V2** icon appears at the top
right of the window (Secondary Side Bar). Click it to open the chat.

If you previously sideloaded an older `local.opencode-v2-sidebar` build,
uninstall it first — two extensions contributing `opencodeV2.chatView` at once
will conflict.

For local development, run `.\install.ps1` instead — it copies the source into
`~/.vscode/extensions/Polasie.opencode-v2-sidebar-<version>`.

## How it works

1. `opencode service status` gives the local service URL.
2. `opencode service get password` gives the one-time server password.
3. The extension starts a loopback-only proxy on `127.0.0.1:<random port>` that
   injects `Authorization: Basic ...` into requests and streams the official
   web UI into a webview (including WebSocket upgrades).

Nothing is sent to a third party, and no password is stored by this extension.
If the service restarts or the password changes, press **Reconnect** in the
sidebar header — it re-resolves both values.

## Troubleshooting

- Blank view → press **Reconnect**.
- Check **Output** → **OpenCode V2 Sidebar** for proxy/startup messages.
- Confirm the service is healthy with `opencode service status` and
  `opencode api get /api/info`.

## Build from source

```powershell
npx --yes @vscode/vsce package
```

## ภาษาไทย (ย่อ)

ส่วนเสริมที่ฝัง Web UI ของ OpenCode V2 ไว้ **ด้านขวา** ของ VS Code
(Secondary Side Bar) เหมือน Copilot / Claude Code ไม่ทับกับ Explorer และ Git
ต้องมี OpenCode v2 และ `opencode service` รันอยู่ กด **Reconnect** หาก service
restart หรือเปลี่ยนรหัสผ่าน

## License

MIT — see [LICENSE](LICENSE).
