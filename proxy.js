const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { execFile } = require("child_process");
const uiPatch = require("./ui-patch");

let currentService = null;
let currentGroupBy = "project";

function setGroupBy(mode) {
  currentGroupBy = uiPatch.normalizeMode(mode);
}

function getGroupBy() {
  return currentGroupBy;
}

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

function parseServiceStatus(text) {
  const urlText = String(text)
    .split(/\r?\n/)
    .map((line) => line.match(/https?:\/\/[^\s]+/)?.[0])
    .find(Boolean);
  if (!urlText) {
    throw new Error("Could not read OpenCode service URL from `opencode service status`");
  }
  return new URL(urlText);
}

async function resolveService() {
  const status = await runOpenCode(["service", "status"]);
  const url = parseServiceStatus(status);
  const password = (await runOpenCode(["service", "get", "password"])).trim();
  if (!password) {
    throw new Error("OpenCode service password is empty");
  }
  currentService = { url, password };
  return currentService;
}

function setService(service) {
  currentService = service;
}

function getService() {
  return currentService;
}

function serviceSignature(service) {
  return `${service.url.toString()}\n${service.password}`;
}

function authHeaders(service, extra) {
  const token = Buffer.from(`opencode:${service.password}`).toString("base64");
  return {
    ...(extra || {}),
    host: service.url.host,
    authorization: `Basic ${token}`,
  };
}

function targetFor(service) {
  return {
    hostname: service.url.hostname,
    port: service.url.port || (service.url.protocol === "https:" ? 443 : 80),
  };
}

function writeUpgradeResponse(socket, upstreamResponse) {
  let raw = "HTTP/1.1 101 Switching Protocols\r\n";
  for (const [key, value] of Object.entries(upstreamResponse.headers || {})) {
    raw += `${key}: ${value}\r\n`;
  }
  socket.write(raw + "\r\n");
}

function isJsAsset(reqUrl) {
  try {
    return new URL(reqUrl, "http://127.0.0.1").pathname.endsWith(".js");
  } catch {
    return false;
  }
}

function decodeBody(buffer, headers) {
  const encoding = String(headers["content-encoding"] || "").toLowerCase();
  if (encoding.includes("gzip") || (buffer.length > 1 && buffer[0] === 0x1f && buffer[1] === 0x8b)) {
    return zlib.gunzipSync(buffer);
  }
  if (encoding.includes("br")) return zlib.brotliDecompressSync(buffer);
  if (encoding.includes("deflate")) return zlib.inflateSync(buffer);
  return buffer;
}

function patchedHeaders(upHeaders, body) {
  const headers = { ...upHeaders };
  for (const key of [
    "content-encoding",
    "content-length",
    "transfer-encoding",
    "etag",
    "last-modified",
  ]) {
    delete headers[key];
  }
  headers["content-length"] = String(body.length);
  headers["cache-control"] = "no-store";
  return headers;
}

function createProxy(service, options = {}) {
  const transport = service.url.protocol === "https:" ? https : http;
  const target = targetFor(service);

  const server = http.createServer((req, res) => {
    const transform = req.method === "GET" && isJsAsset(req.url);
    const requestHeaders = authHeaders(service, req.headers);
    if (transform) delete requestHeaders["accept-encoding"];

    const upstream = transport.request(
      {
        ...target,
        path: req.url,
        method: req.method,
        headers: requestHeaders,
      },
      (upRes) => {
        if (!transform) {
          res.writeHead(upRes.statusCode || 502, {
            ...upRes.headers,
            "cache-control": "no-store",
          });
          upRes.pipe(res);
          return;
        }

        const chunks = [];
        upRes.on("data", (chunk) => chunks.push(chunk));
        upRes.on("end", () => {
          const raw = Buffer.concat(chunks);
          let body = raw;
          let headers = { ...upRes.headers, "cache-control": "no-store" };
          try {
            body = decodeBody(raw, upRes.headers);
            const result = uiPatch.patchUiAsset(body.toString("utf8"), {
              groupBy: currentGroupBy,
            });
            body = Buffer.from(result.source, "utf8");
            headers = patchedHeaders(upRes.headers, body);
            if (result.patched) {
              options.log?.(`UI grouping patch applied (${result.mode})`);
            } else if (result.reason !== "grouping disabled") {
              options.log?.(`UI grouping patch skipped: ${result.reason}`);
            }
          } catch (error) {
            options.log?.(`UI grouping patch failed: ${error.message}`);
            body = raw;
          }
          res.writeHead(upRes.statusCode || 502, headers);
          res.end(body);
        });
        upRes.on("error", () => {
          if (!res.headersSent) res.writeHead(502);
          res.end();
        });
      }
    );
    upstream.on("error", (error) => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      }
      res.end(`OpenCode proxy error: ${error.message}`);
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

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
        target: service.url.toString(),
        service,
      });
    });
  });
}

function probeService(service, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const transport = service.url.protocol === "https:" ? https : http;
    const request = transport.request(
      {
        ...targetFor(service),
        path: "/api/info",
        method: "GET",
        headers: authHeaders(service),
      },
      (response) => {
        response.resume();
        const status = response.statusCode || 0;
        resolve(status >= 200 && status < 400);
      }
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error("timeout")));
    request.on("error", () => resolve(false));
    request.end();
  });
}

module.exports = {
  parseServiceStatus,
  resolveService,
  setService,
  getService,
  setGroupBy,
  getGroupBy,
  serviceSignature,
  authHeaders,
  createProxy,
  probeService,
};
