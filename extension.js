const vscode = require("vscode");
const proxyModule = require("./proxy");

const CHECK_INTERVAL_MS = 15000;

let output = null;
let proxyServer = null;
let proxyBaseUrl = null;
let monitorTimer = null;
let checking = false;

function escapeHtml(value) {
  return String(value).replace(/[<>&]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[char]);
}

async function ensureProxy(force, service) {
  if (!force && proxyServer) return proxyBaseUrl;

  const nextService = service || (await proxyModule.resolveService());
  const next = await proxyModule.createProxy(nextService, {
    log: (message) => output?.appendLine(message),
  });
  const previous = proxyServer;

  proxyServer = next.server;
  proxyBaseUrl = next.url;
  proxyModule.setService(nextService);

  if (previous) previous.close();
  output?.appendLine(`OpenCode V2 proxy ${next.url} -> ${next.target}`);
  return proxyBaseUrl;
}

function closeProxy() {
  proxyServer?.close();
  proxyServer = null;
  proxyBaseUrl = null;
}

function webviewHtml(baseUrl, statusText, ok) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* https://127.0.0.1:*; child-src http://127.0.0.1:* https://127.0.0.1:*; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src http://127.0.0.1:* https://127.0.0.1:* data:; connect-src http://127.0.0.1:* https://127.0.0.1:*;" />
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body { display: flex; flex-direction: column; font-family: var(--vscode-font-family); }
  header { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--vscode-panel-border); flex: 0 0 auto; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 3px 8px; cursor: pointer; border-radius: 2px; font-size: 11px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; }
  #dot.ok { background: #3fb950; }
  #dot.bad { background: #f85149; }
  #status { color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto; }
  #frame { flex: 1 1 auto; width: 100%; border: 0; min-height: 0; }
</style>
</head>
<body>
<header>
  <button id="reconnect" title="Re-read OpenCode service URL and password">Reconnect</button>
  <span id="dot" class="${ok ? "ok" : "bad"}"></span>
  <span id="status">${escapeHtml(statusText)}</span>
</header>
<iframe id="frame" title="OpenCode V2" src="${baseUrl}/"></iframe>
<script>
  const vscode = acquireVsCodeApi();
  const dot = document.getElementById("dot");
  const status = document.getElementById("status");
  document.getElementById("reconnect").addEventListener("click", () => {
    status.textContent = "Reconnecting…";
    dot.className = "bad";
    vscode.postMessage({ type: "reconnect" });
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message) return;
    if (message.type === "status") {
      status.textContent = message.text;
      dot.className = message.ok ? "ok" : "bad";
    }
    if (message.type === "reload") {
      document.getElementById("frame").src = message.url + "/?t=" + Date.now();
    }
    if (message.type === "error") {
      status.textContent = message.message;
      dot.className = "bad";
    }
  });
</script>
</body>
</html>`;
}

class OpenCodeV2ViewProvider {
  constructor(outputChannel) {
    this.output = outputChannel;
    this.view = null;
    this.statusText = null;
    this.statusOk = null;
  }

  post(message) {
    if (!this.view) return;
    Promise.resolve(this.view.webview.postMessage(message)).catch(() => {});
  }

  setStatus(text, ok) {
    if (this.statusText === text && this.statusOk === ok) return;
    this.statusText = text;
    this.statusOk = ok;
    this.post({ type: "status", text, ok });
  }

  async resolveWebviewView(webviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: [],
    };
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!message || message.type !== "reconnect") return;
      await reconnect(this, "manual");
    });
    await this.render();
  }

  async render() {
    if (!this.view) return;
    try {
      const url = await ensureProxy(false);
      this.statusText = "Connected";
      this.statusOk = true;
      this.view.webview.html = webviewHtml(url, this.statusText, this.statusOk);
    } catch (error) {
      this.statusText = "Disconnected";
      this.statusOk = false;
      this.output.appendLine(`Startup failed: ${error.message}`);
      this.view.webview.html = `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:12px">
        <h3>OpenCode V2</h3><p>${escapeHtml(error.message)}</p>
        <p>ตรวจสอบว่า <code>opencode service status</code> ทำงานได้</p></body></html>`;
    }
  }
}

async function reconnect(provider, reason, service) {
  provider.setStatus("Reconnecting…", false);
  try {
    const url = await ensureProxy(true, service);
    provider.post({ type: "reload", url });
    provider.setStatus("Connected", true);
    output?.appendLine(`Reconnected (${reason}) -> ${url}`);
  } catch (error) {
    provider.setStatus("Disconnected", false);
    provider.post({ type: "error", message: error.message });
    output?.appendLine(`Reconnect failed (${reason}): ${error.message}`);
  }
}

async function checkService(provider) {
  if (!provider.view || checking) return;
  checking = true;
  try {
    const active = proxyModule.getService();
    if (!active) {
      await reconnect(provider, "initial");
      return;
    }

    const healthy = await proxyModule.probeService(active);
    if (!healthy) {
      await reconnect(provider, "health check failed");
      return;
    }

    provider.setStatus("Connected", true);
    try {
      const latest = await proxyModule.resolveService();
      if (proxyModule.serviceSignature(latest) !== proxyModule.serviceSignature(active)) {
        await reconnect(provider, "credentials changed", latest);
      }
    } catch (error) {
      output?.appendLine(`Service refresh skipped: ${error.message}`);
    }
  } catch (error) {
    output?.appendLine(`Monitor error: ${error.message}`);
  } finally {
    checking = false;
  }
}

function startMonitor(provider) {
  stopMonitor();
  monitorTimer = setInterval(() => void checkService(provider), CHECK_INTERVAL_MS);
  monitorTimer.unref?.();
}

function stopMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

async function focusView() {
  const candidates = [
    "workbench.view.extension.opencodeV2",
    "opencodeV2.chatView.focus",
    "workbench.action.focusAuxiliaryBar",
  ];
  for (const command of candidates) {
    try {
      await vscode.commands.executeCommand(command);
      output?.appendLine(`Focused view via ${command}`);
      return;
    } catch (error) {
      output?.appendLine(`Focus via ${command} failed: ${error.message}`);
    }
  }
}

async function activate(context) {
  output = vscode.window.createOutputChannel("OpenCode V2 Sidebar");
  context.subscriptions.push(output);

  const provider = new OpenCodeV2ViewProvider(output);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("opencodeV2.chatView", provider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("opencodeV2.focus", () => focusView())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("opencodeV2.reconnect", () => reconnect(provider, "command"))
  );

  const configuredMode = vscode.workspace
    .getConfiguration("opencodeV2")
    .get("groupBy", "project");
  proxyModule.setGroupBy(configuredMode);
  output.appendLine(`Session grouping mode: ${proxyModule.getGroupBy()}`);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("opencodeV2.groupBy")) return;
      const mode = vscode.workspace.getConfiguration("opencodeV2").get("groupBy", "project");
      proxyModule.setGroupBy(mode);
      output.appendLine(`Session grouping mode changed to ${proxyModule.getGroupBy()}`);
      if (proxyBaseUrl) provider.post({ type: "reload", url: proxyBaseUrl });
    })
  );

  context.subscriptions.push({
    dispose() {
      stopMonitor();
      closeProxy();
    },
  });

  startMonitor(provider);
  setTimeout(() => void focusView(), 50);
}

function deactivate() {
  stopMonitor();
  closeProxy();
}

module.exports = { activate, deactivate };
