const assert = require("node:assert/strict");
const test = require("node:test");
const uiPatch = require("../ui-patch");
const { ORIGINAL_PM, SAMPLE_SOURCE, makeRecords } = require("./fixture");

const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

function extractPm(source) {
  const start = source.indexOf("function pm(");
  const end = uiPatch.findFunctionEnd(source, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

function runGrouping(source, records) {
  const fn = new Function(`return (${extractPm(source)})`)();
  return fn(records, { t: (key) => key });
}

test("normalizeMode falls back safely", () => {
  assert.equal(uiPatch.normalizeMode("directory"), "directory");
  assert.equal(uiPatch.normalizeMode("none"), "none");
  assert.equal(uiPatch.normalizeMode("bogus"), "project");
});

test("patchUiAsset replaces only the Home grouping function", () => {
  const result = uiPatch.patchUiAsset(SAMPLE_SOURCE, { groupBy: "project" });
  assert.equal(result.patched, true);
  assert.equal(result.mode, "project");
  assert.ok(result.source.startsWith("/* prefix */ "));
  assert.ok(result.source.includes(" /* suffix */"));
  assert.equal(result.source.includes("home.sessions.group.today"), false);
});

test("project mode groups the same records by project and keeps newest first", () => {
  const result = uiPatch.patchUiAsset(SAMPLE_SOURCE, { groupBy: "project" });
  const records = makeRecords();
  const groups = runGrouping(result.source, records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].id, "p1");
  assert.equal(groups[0].title, "HP");
  assert.deepEqual(groups[0].sessions.map((r) => r.session.id), ["s2", "s1"]);
  assert.equal(groups[1].id, "p2");
  assert.equal(groups[1].title, "RAS");
  assert.equal(groups[1].sessions[0].session.id, "s3");
  // The original record objects are reused, not copies.
  assert.equal(groups[0].sessions[0], records[1]);
});

test("directory mode groups by location.directory", () => {
  const result = uiPatch.patchUiAsset(SAMPLE_SOURCE, { groupBy: "directory" });
  const groups = runGrouping(result.source, makeRecords());
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups.map((g) => g.id).sort(),
    ["C:\\Users\\HP", "D:\\work\\RAS"]
  );
});

test("pin layout is applied with CSS order without moving DOM or reloading", () => {
  const result = uiPatch.patchUiAsset(SAMPLE_SOURCE, { groupBy: "project" });
  assert.ok(result.source.includes("h.style.order"));
  assert.ok(result.source.includes("body.style.order"));
  assert.ok(result.source.includes("r.style.order"));
  assert.ok(result.source.includes("new MutationObserver(applyPinLayout)"));
  assert.ok(result.source.includes('[data-slot=\\"home-sessions-list\\"]{display:flex'));
  assert.equal(result.source.includes("location.reload()"), false);
  assert.equal(result.source.includes("wrap.appendChild"), false);
});

test("collapse and pin support are injected into the official header", () => {
  const result = uiPatch.patchUiAsset(SAMPLE_SOURCE, { groupBy: "project" });
  assert.equal(result.collapse, true);
  assert.equal(result.pin, true);
  assert.ok(result.source.includes("data-oc-group-key"));
  assert.ok(result.source.includes("data-oc-chevron"));
  assert.ok(result.source.includes("__ocEnhance"));
  assert.ok(result.source.includes("Pin project to top"));
  assert.ok(result.source.includes("Pin chat to top"));
  assert.ok(result.source.includes("More actions"));
  assert.ok(result.source.includes('typeof e.title==="function"'));
  assert.ok(result.source.includes('document.querySelectorAll("[data-oc-group-key]")'));
  assert.ok(result.source.includes('closest("[data-oc-group-key]")'));
  assert.ok(result.source.includes('[data-oc-group-key][data-oc-collapsed='));
  assert.ok(result.source.includes("data:image/svg+xml;base64,"));
  assert.ok(result.source.includes("ZmlsbD0nbm9uZSc"));
  assert.ok(result.source.includes("c3Ryb2tlPSdibGFjayc"));
  assert.ok(result.source.includes("width:12px;height:12px"));
  assert.ok(result.source.includes("background-color:currentColor"));
  assert.equal(result.source.includes("\u{1F4CC}"), false);
  assert.ok(result.source.includes("function applyPinLayout()"));
  assert.equal(result.source.includes("location.reload()"), false);
  assert.equal(result.source.includes("wrap.appendChild"), false);
  assert.ok(result.source.includes("data-oc-order"));
  assert.ok(result.source.includes("if(!m.contains(ev.target))close()"));
  assert.equal(result.source.includes('addEventListener("pointerdown",close'), false);
  assert.equal(result.source.includes("var key=String(e.title())"), false);
  assert.equal(result.source.includes("function gg(e){return"), false);
});

test("none mode leaves the official UI untouched", () => {
  const result = uiPatch.patchUiAsset(SAMPLE_SOURCE, { groupBy: "none" });
  assert.equal(result.patched, false);
  assert.equal(result.reason, "grouping disabled");
  assert.equal(result.source, SAMPLE_SOURCE);
});

test("patchUiAsset refuses ambiguous or changed signatures", () => {
  const missing = uiPatch.patchUiAsset("console.log(1)", { groupBy: "project" });
  assert.equal(missing.patched, false);
  assert.match(missing.reason, /not found/);

  const changed = uiPatch.patchUiAsset(
    "function pm(e,t){return []}",
    { groupBy: "project" }
  );
  assert.equal(changed.patched, false);
  assert.match(changed.reason, /signature changed/);
});

test("generated function does not depend on outer scope", () => {
  const source = uiPatch.buildGroupingFunction("project");
  const fn = new Function(`${source}; return pm([]);`)();
  assert.deepEqual(fn, []);
  assert.equal(source.includes(ORIGINAL_PM), false);
});
