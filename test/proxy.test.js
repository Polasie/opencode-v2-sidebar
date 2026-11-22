const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const proxy = require("../proxy");

function basic(password) {
  return `Basic ${Buffer.from(`opencode:${password}`).toString("base64")}`;
}

function startUpstream(expectedAuthorization) {
  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== expectedAuthorization) {
      res.writeHead(401, { "content-type": "application/json" });
      res.end('{"error":"unauthorized"}');
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => resolve({ status: response.statusCode, body }));
      })
      .on("error", reject);
  });
}

test("parseServiceStatus finds the service URL", () => {
  const url = proxy.parseServiceStatus(
    "checking service...\nserver listening on http://127.0.0.1:28894\n"
  );
  assert.equal(url.toString(), "http://127.0.0.1:28894/");
});

test("parseServiceStatus throws when no URL is present", () => {
  assert.throws(() => proxy.parseServiceStatus("service is down"), /service URL/);
});

test("authHeaders builds the expected Basic auth and signature tracks password", () => {
  const service = { url: new URL("http://127.0.0.1:1234"), password: "s3cret" };
  assert.equal(proxy.authHeaders(service).authorization, basic("s3cret"));
  assert.notEqual(
    proxy.serviceSignature(service),
    proxy.serviceSignature({ url: service.url, password: "rotated" })
  );
});

test("proxy injects auth and probeService detects rotation", async (t) => {
  const expected = basic("s3cret");
  const upstream = await startUpstream(expected);
  t.after(() => new Promise((resolve) => upstream.close(resolve)));

  const service = {
    url: new URL(`http://127.0.0.1:${upstream.address().port}`),
    password: "s3cret",
  };

  const info = await proxy.createProxy(service);
  t.after(() => new Promise((resolve) => info.server.close(resolve)));

  const response = await get(`${info.url}/api/info`);
  assert.equal(response.status, 200);
  assert.equal(response.body, '{"ok":true}');

  assert.equal(await proxy.probeService(service), true);
  assert.equal(await proxy.probeService({ ...service, password: "wrong" }), false);
});
