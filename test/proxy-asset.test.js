const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const zlib = require("node:zlib");
const proxy = require("../proxy");
const uiPatch = require("../ui-patch");
const { ORIGINAL_PM, makeRecords } = require("./fixture");

function startAssetUpstream(state) {
  const server = http.createServer((req, res) => {
    state.lastHeaders = req.headers;
    if (req.url === "/_assets/index-TEST.js") {
      const body = Buffer.from(`/* ui */ ${ORIGINAL_PM} /* end */`, "utf8");
      if (state.gzip) {
        res.writeHead(200, {
          "content-type": "application/javascript",
          "content-encoding": "gzip",
          "content-length": String(zlib.gzipSync(body).length),
        });
        res.end(zlib.gzipSync(body));
      } else {
        res.writeHead(200, {
          "content-type": "application/javascript",
          "content-length": String(body.length),
        });
        res.end(body);
      }
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function get(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    http
      .get(url, { headers: extraHeaders }, (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            raw: Buffer.concat(chunks),
          })
        );
      })
      .on("error", reject);
  });
}

async function withProxy(t, gzip) {
  const state = { gzip, lastHeaders: null };
  const upstream = await startAssetUpstream(state);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));
  const service = {
    url: new URL(`http://127.0.0.1:${upstream.address().port}`),
    password: "pw",
  };
  const logs = [];
  const info = await proxy.createProxy(service, { log: (m) => logs.push(m) });
  t.after(() => new Promise((resolve) => info.server.close(resolve)));
  return { info, state, logs };
}

test("proxy patches the JS asset and strips compression/length headers", async (t) => {
  const { info, state, logs } = await withProxy(t, false);
  proxy.setGroupBy("project");

  const response = await get(`${info.url}/_assets/index-TEST.js`, {
    "accept-encoding": "gzip, deflate",
  });

  assert.equal(response.status, 200);
  assert.equal(state.lastHeaders["accept-encoding"], undefined);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["content-encoding"], undefined);
  assert.equal(Number(response.headers["content-length"]), response.raw.length);
  assert.equal(response.body.includes("home.sessions.group.today"), false);
  assert.ok(logs.some((line) => line.includes("UI grouping patch applied (project)")));

  const start = response.body.indexOf("function pm(");
  const end = uiPatch.findFunctionEnd(response.body, start);
  const fn = new Function(`return (${response.body.slice(start, end)})`)();
  const groups = fn(makeRecords(), { t: (k) => k });
  assert.equal(groups.length, 2);
});

test("proxy decodes gzip assets before patching", async (t) => {
  const { info } = await withProxy(t, true);
  proxy.setGroupBy("directory");

  const response = await get(`${info.url}/_assets/index-TEST.js`);

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-encoding"], undefined);
  assert.equal(Number(response.headers["content-length"]), response.raw.length);
  assert.equal(response.body.includes("home.sessions.group.today"), false);
  assert.ok(response.body.includes('n==="directory"'));
});

test("proxy leaves non-JS responses completely untouched", async (t) => {
  const { info } = await withProxy(t, false);
  const response = await get(`${info.url}/api/info`);
  assert.equal(response.status, 200);
  assert.equal(response.body, '{"ok":true}');
});

test("setGroupBy none keeps the official grouping function", async (t) => {
  const { info } = await withProxy(t, false);
  proxy.setGroupBy("none");
  const response = await get(`${info.url}/_assets/index-TEST.js`);
  assert.ok(response.body.includes("home.sessions.group.today"));
  proxy.setGroupBy("project");
});
