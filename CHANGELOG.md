# Changelog

## 0.3.0

- Group Home sessions by project or directory inside the official embedded UI
  without changing the webview HTML/CSS. Configurable with
  `opencodeV2.groupBy` (`project` / `directory` / `none`).
- Add collapsible group headers (click, or right-click → Collapse/Expand).
- Add right-click Pin/Unpin for both project groups and individual chats.
  Pinned items move to the top instantly via CSS `order` — no DOM moves and no
  iframe reload. A small SVG pin icon marks pinned items.
- Keep the official context menu available through **More actions…** on chats.
- Add unit tests for UI patching, collapse, pin and compressed proxy assets.

## 0.2.1

- Fix the startup focus command: use the view-container open command with
  fallbacks instead of the non-existent `...focus` command.

## 0.2.0

- Focus the OpenCode V2 view automatically after startup.
- Add `OpenCode V2: Focus Chat` and `OpenCode V2: Reconnect` commands.
- Add a 15 s health check with automatic reconnect when the service restarts
  or its password rotates, plus a connected/disconnected status dot.
- Extract the proxy into `proxy.js` and add `node:test` unit tests.
- Add GitHub Actions CI/release workflow and `.gitattributes`.

## 0.1.0

- Initial public release.
- Contributions the view container to the Secondary Side Bar (right side).
- Local authenticated proxy for the official OpenCode V2 web UI.
- `Reconnect` action after service restart / password rotation.
- Removed legacy cleanup code that touched unrelated extensions.
