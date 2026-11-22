# Changelog

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
