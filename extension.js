const vscode = require("vscode");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

let proxyServer = null;
let proxyBaseUrl = null;
let output = null;

function cliCandidates() {
  return [
    "opencode",
    path.join(os.homedir(), ".opencode", "bin", "opencode.exe"),
    path.join(os.homedir(), ".opencode", "bin", "opencode"),
  ];
}

function runOpenCode(args) {
  return new Promise((resolve, reject) => {
    const candidates = cliCandidates();
    const attempt = (index) => {
      if (index >= candidates.length) {
        reject(new Error("OpenCode CLI not found (tried PATH and ~/.opencode/bin)"));
        return;
      }
      execFile(
        candidates[index],
        args,
        { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) {
            resolve(stdout.trim());
            return;
          }
          if (error.code === "ENOENT") {
            attempt(index + 1);
            return;
          }
          reject(new Error((stderr || error.message || "OpenCode CLI failed").trim()));
        }
      );
    };
    attempt(0);
  });
}

async function resolveService() {
  const status = await runOpenCode(["service", "status"]);
  const urlText = status
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^https?:\/\//.test(line));
  if (!urlText) {
    throw new Error("Could not read OpenCode service URL from `opencode service status`");
  }
  const password = (await runOpenCode(["service", "get", "password"])).trim();
  return { url: new URL(urlText), password };
}

function authHeaders(service, extra) {
  const token = Buffer.from(`opencode:${service.password}`).toString("base64");
  return {
    ...(extra || {}),
    host: service.url.host,
    authorization: `Basic ${token}`,
  };
}

function writeUpgradeResponse(socket, upstreamResponse) {
  let raw = "HTTP/1.1 101 Switching Protocols\r\n";
  for (const [key, value] of Object.entries(upstreamResponse.headers || {})) {
    raw += `${key}: ${value}\r\n`;
  }
  socket.write(raw + "\r\n");
}

async function createProxy() {
  const service = await resolveService();
  const transport = service.url.protocol === "https:" ? https : http;
  const target = {
    hostname: service.url.hostname,
    port: service.url.port || (service.url.protocol === "https:" ? 443 : 80),
  };

  const server = http.createServer((req, res) => {
    const upstream = transport.request(
      {
        ...target,
        path: req.url,
        method: req.method,
        headers: authHeaders(service, req.headers),
      },
      (upRes) => {
        const headers = { ...upRes.headers, "cache-control": "no-store" };
        res.writeHead(upRes.statusCode || 502, headers);
        upRes.pipe(res);
      }
    );
    upstream.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(`OpenCode proxy error: ${error.message}`);
      output?.appendLine(`Proxy request error: ${error.message}`);
    });
    req.pipe(upstream);
  });

  server.on("upgrade", (req, clientSocket, head) => {
    const upstream = transport.request({
      ...target,
      path: req.url,
      method: "GET",
      headers: authHeaders(service, req.headers),
    });
    upstream.on("upgrade", (upRes, upSocket, upHead) => {
      writeUpgradeResponse(clientSocket, upRes);
      if (upHead && upHead.length) clientSocket.write(upHead);
      if (head && head.length) upSocket.write(head);
      upSocket.pipe(clientSocket);
      clientSocket.pipe(upSocket);
    });
    upstream.on("response", (upRes) => {
      let raw = `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage || ""}\r\n`;
      for (const [key, value] of Object.entries(upRes.headers || {})) {
        raw += `${key}: ${value}\r\n`;
      }
      clientSocket.write(raw + "\r\n");
      upRes.pipe(clientSocket);
    });
    upstream.on("error", () => clientSocket.destroy());
    upstream.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    target: service.url.toString(),
  };
}

async function ensureProxy(force) {
  if (force) {
    proxyServer?.close();
    proxyServer = null;
    proxyBaseUrl = null;
  }
  if (!proxyServer) {
    const proxy = await createProxy();
    proxyServer = proxy.server;
    proxyBaseUrl = proxy.url;
    output?.appendLine(`OpenCode V2 proxy ${proxy.url} -> ${proxy.target}`);
  }
  return proxyBaseUrl;
}

function webviewHtml(baseUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:*; child-src http://127.0.0.1:*; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src http://127.0.0.1:* data:; connect-src http://127.0.0.1:*;" />
<style>
  html, body { height: 100%; margin: 0; overflow: hidden; }
  body { display: flex; flex-direction: column; font-family: var(--vscode-font-family); }
  header { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-bottom: 1px solid var(--vscode-panel-border); flex: 0 0 auto; }
  button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 0; padding: 3px 8px; cursor: pointer; border-radius: 2px; font-size: 11px; }
  button:hover { background: var(--vscode-button-hoverBackground); }
  #status { color: var(--vscode-descriptionForeground); font-size: 11px; margin-left: auto; }
  #frame { flex: 1 1 auto; width: 100%; border: 0; min-height: 0; }
</style>
</head>
<body>
<header>
  <button id="reconnect" title="Re-read OpenCode service URL and password">Reconnect</button>
  <span id="status">OpenCode V2</span>
</header>
<iframe id="frame" title="OpenCode V2" src="${baseUrl}/"></iframe>
<script>
  const vscode = acquireVsCodeApi();
  document.getElementById("reconnect").addEventListener("click", () => {
    document.getElementById("status").textContent = "Reconnecting…";
    vscode.postMessage({ type: "reconnect" });
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message && message.type === "reload") {
      document.getElementById("status").textContent = "OpenCode V2";
      document.getElementById("frame").src = message.url + "/?t=" + Date.now();
    }
    if (message && message.type === "error") {
      document.getElementById("status").textContent = message.message;
    }
  });
</script>
</body>
</html>`;
}

class OpenCodeV2ViewProvider {
  constructor(extensionUri, outputChannel) {
    this.extensionUri = extensionUri;
    this.output = outputChannel;
    this.view = null;
  }

  async resolveWebviewView(webviewView, context, token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      enableCommandUris: false,
      localResourceRoots: [],
    };
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (!message || message.type !== "reconnect") return;
      try {
        const url = await ensureProxy(true);
        webviewView.webview.postMessage({ type: "reload", url });
      } catch (error) {
        this.output.appendLine(`Reconnect failed: ${error.message}`);
        webviewView.webview.postMessage({ type: "error", message: error.message });
      }
    });
    await this.render();
  }

  async render() {
    if (!this.view) return;
    try {
      const url = await ensureProxy(false);
      this.view.webview.html = webviewHtml(url);
    } catch (error) {
      this.output.appendLine(`Startup failed: ${error.message}`);
      this.view.webview.html = `<!DOCTYPE html><html><body style="font-family:var(--vscode-font-family);padding:12px">
        <h3>OpenCode V2</h3><p>${String(error.message).replace(/[<>&]/g, "")}</p>
        <p>ตรวจสอบว่า <code>opencode service status</code> ทำงานได้</p></body></html>`;
    }
  }
}

async function activate(context) {
  output = vscode.window.createOutputChannel("OpenCode V2 Sidebar");
  context.subscriptions.push(output);
  const provider = new OpenCodeV2ViewProvider(context.extensionUri, output);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("opencodeV2.chatView", provider)
  );
  context.subscriptions.push({
    dispose() {
      proxyServer?.close();
      proxyServer = null;
      proxyBaseUrl = null;
    },
  });
}

function deactivate() {
  proxyServer?.close();
  proxyServer = null;
  proxyBaseUrl = null;
}

module.exports = { activate, deactivate };
