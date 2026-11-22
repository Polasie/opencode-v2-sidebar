"use strict";

const MODES = new Set(["project", "directory", "none"]);

function normalizeMode(mode) {
  return MODES.has(mode) ? mode : "project";
}

// Brace-match a minified function body, skipping strings and template literals.
function findFunctionEnd(source, start) {
  const open = source.indexOf("{", start);
  if (open < 0) return -1;
  let depth = 0;
  let quote = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function buildGroupingFunction(mode) {
  const literal = JSON.stringify(mode);
  // Groups the exact same record objects the original function used, so every
  // button, row renderer and handler in the official UI keeps working.
  // Pin ordering is applied later with CSS `order`, never by moving DOM nodes.
  return `function pm(e,t){let n=${literal},r=new Map();for(let o of e){let s=o.session||{},i=o.project||{},a=s.location&&s.location.directory||"";let c=n==="directory"?(a||i.worktree||"unknown-directory"):(i.id||s.projectID||i.worktree||a||"unknown-project");let l=r.get(c);if(!l){l={id:c,title:n==="directory"?(a||i.worktree||"Unknown directory"):(o.projectName||i.worktree||a||"Unknown project"),sessions:[]};r.set(c,l)}l.sessions.push(o)}for(let g of r.values()){g.sessions.sort((a,b)=>{let x=(a.session&&a.session.time)||{},y=(b.session&&b.session.time)||{};return (y.updated||y.created||0)-(x.updated||x.created||0)})}return [...r.values()].sort((a,b)=>{let x=(a.sessions[0]&&a.sessions[0].session&&a.sessions[0].session.time)||{},y=(b.sessions[0]&&b.sessions[0].session&&b.sessions[0].session.time)||{};return (y.updated||y.created||0)-(x.updated||x.created||0)})}`;
}

// Keeps the official header DOM and bindings, adding only:
//  - a chevron + click-to-collapse
//  - a data attribute with the group key so the enhancer can pin it
//  - a right-click handler that opens the shared context menu
function buildCollapseHeader() {
  return `function gg(e){var tv=typeof e.title==="function"?e.title():e.title,key=String(tv??"");return(()=>{var t=Hh(),n=t.firstChild,r=e.onSetRef,chev=document.createElement("span");chev.setAttribute("data-oc-chevron","");chev.textContent=localStorage.getItem("oc-collapsed:"+key)==="1"?"▸":"▾";t.insertBefore(chev,n);t.style.justifyContent="flex-start";t.style.gap="6px";t.setAttribute("data-oc-group-key",key);t.setAttribute("data-oc-collapsed",localStorage.getItem("oc-collapsed:"+key)==="1"?"true":"false");t.addEventListener("click",function(ev){if(ev.target&&ev.target.closest&&ev.target.closest("[data-action]"))return;window.__ocEnhance&&window.__ocEnhance.toggleGroup(t,key,chev)});t.addEventListener("contextmenu",function(ev){if(window.__ocSkipMenu)return;ev.preventDefault();ev.stopPropagation();window.__ocEnhance&&window.__ocEnhance.groupMenu(t,key,ev.clientX,ev.clientY,chev)});if(typeof r==="function")H(r,t);else e.onSetRef=t;N(n,()=>e.title);A(r=>{var i={"home-session-group-header z-[5]":!!e.elevated,"z-10":!e.elevated},a=e.titleOpacity;return r.e=F(t,i,r.e),a!==r.t&&R(n,"opacity",r.t=a),r},{e:void 0,t:void 0});return t})()}`;
}

// Appended to the module so it runs once inside the iframe. It installs the
// context menus and applies pin ordering with CSS without moving DOM nodes.
const ENHANCER_SOURCE = `function(){
  if(window.__ocEnhance) return;
  var style=document.createElement("style");
  style.textContent=[
    "[data-slot=\\"home-sessions-list\\"]{display:flex!important;flex-direction:column!important}",
    "[data-oc-group-key]{pointer-events:auto!important;cursor:pointer}",
    "[data-oc-group-key][data-oc-collapsed=\\"true\\"]+div{display:none!important}",
    "[data-oc-chevron]{font-size:10px;opacity:.7;flex:0 0 auto}",
    "[data-oc-pinned=\\"true\\"]::after{content:'';display:inline-block;width:12px;height:12px;margin-left:5px;flex:0 0 auto;background-color:currentColor;opacity:.85;-webkit-mask:url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nbm9uZScgc3Ryb2tlPSdibGFjaycgc3Ryb2tlLXdpZHRoPScyJyBzdHJva2UtbGluZWNhcD0ncm91bmQnIHN0cm9rZS1saW5lam9pbj0ncm91bmQnPjxsaW5lIHgxPScxMicgeTE9JzE3JyB4Mj0nMTInIHkyPScyMicvPjxwYXRoIGQ9J001IDE3aDE0di0xLjc2YTIgMiAwIDAgMC0xLjExLTEuNzlsLTEuNzgtLjlBMiAyIDAgMCAxIDE1IDEwLjc2VjZoMWEyIDIgMCAwIDAgMC00SDhhMiAyIDAgMCAwIDAgNGgxdjQuNzZhMiAyIDAgMCAxLTEuMTEgMS43OWwtMS43OC45QTIgMiAwIDAgMCA1IDE1LjI0WicvPjwvc3ZnPg==') center/contain no-repeat;mask:url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCAyNCAyNCcgZmlsbD0nbm9uZScgc3Ryb2tlPSdibGFjaycgc3Ryb2tlLXdpZHRoPScyJyBzdHJva2UtbGluZWNhcD0ncm91bmQnIHN0cm9rZS1saW5lam9pbj0ncm91bmQnPjxsaW5lIHgxPScxMicgeTE9JzE3JyB4Mj0nMTInIHkyPScyMicvPjxwYXRoIGQ9J001IDE3aDE0di0xLjc2YTIgMiAwIDAgMC0xLjExLTEuNzlsLTEuNzgtLjlBMiAyIDAgMCAxIDE1IDEwLjc2VjZoMWEyIDIgMCAwIDAgMC00SDhhMiAyIDAgMCAwIDAgNGgxdjQuNzZhMiAyIDAgMCAxLTEuMTEgMS43OWwtMS43OC45QTIgMiAwIDAgMCA1IDE1LjI0WicvPjwvc3ZnPg==') center/contain no-repeat}",
    ".oc-menu{position:fixed;z-index:100000;min-width:170px;background:#252526;color:#cccccc;border:1px solid #454545;border-radius:6px;padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.45);font:12px/1.4 system-ui,sans-serif}",
    ".oc-menu button{display:block;width:100%;text-align:left;background:transparent;border:0;color:inherit;padding:6px 10px;border-radius:4px;cursor:pointer;font:inherit}",
    ".oc-menu button:hover{background:#094771;color:#ffffff}"
  ].join("");
  document.head.appendChild(style);

  function read(k){try{return localStorage.getItem(k)==="1"}catch(e){return false}}
  function write(k,v){try{v?localStorage.setItem(k,"1"):localStorage.removeItem(k)}catch(e){}}
  function close(){
    var all=document.querySelectorAll(".oc-menu");
    for(var i=0;i<all.length;i++){
      if(all[i]._ocOutside)document.removeEventListener("pointerdown",all[i]._ocOutside);
      all[i].remove();
    }
  }
  function showMenu(x,y,items){
    close();
    var m=document.createElement("div");m.className="oc-menu";
    items.forEach(function(it){
      if(!it)return;
      var b=document.createElement("button");b.textContent=it.label;
      b.addEventListener("click",function(ev){ev.stopPropagation();close();it.run()});
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var box=m.getBoundingClientRect();
    m.style.left=Math.max(4,Math.min(x,window.innerWidth-box.width-8))+"px";
    m.style.top=Math.max(4,Math.min(y,window.innerHeight-box.height-8))+"px";
    m._ocOutside=function(ev){if(!m.contains(ev.target))close()};
    setTimeout(function(){document.addEventListener("pointerdown",m._ocOutside)},0);
  }

  function groupKey(header){return header.getAttribute("data-oc-group-key")||header.textContent.replace(/^[▸▾]\\s*/,"").trim()}
  function toggleGroup(header,key,chev){
    var next=!read("oc-collapsed:"+key);
    header.setAttribute("data-oc-collapsed",next?"true":"false");
    if(chev)chev.textContent=next?"▸":"▾";
    write("oc-collapsed:"+key,next);
  }
  function groupMenu(header,key,x,y,chev){
    var k="oc-pinned-group:"+key,pinned=read(k);
    showMenu(x,y,[
      {label:pinned?"Unpin project":"Pin project to top",run:function(){write(k,!pinned);applyPinLayout()}},
      {label:read("oc-collapsed:"+key)?"Expand group":"Collapse group",run:function(){toggleGroup(header,key,chev)}}
    ]);
  }
  function chatMenu(row,x,y){
    var id=row.getAttribute("data-session-id");
    if(!id)return;
    var k="oc-pinned-session:"+id,pinned=read(k);
    showMenu(x,y,[
      {label:pinned?"Unpin chat":"Pin chat to top",run:function(){write(k,!pinned);applyPinLayout()}},
      {label:"More actions…",run:function(){
        window.__ocSkipMenu=true;
        row.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:x,clientY:y}));
        setTimeout(function(){window.__ocSkipMenu=false},0);
      }}
    ]);
  }

  // Reorder visually with CSS order only. DOM nodes stay exactly where Solid
  // created them, so no reactive references are broken and no reload is needed.
  function applyPinLayout(){
    var headers=[].slice.call(document.querySelectorAll("[data-oc-group-key]"));
    headers.forEach(function(h,hi){
      if(!h.hasAttribute("data-oc-order"))h.setAttribute("data-oc-order",String(hi));
      var base=+h.getAttribute("data-oc-order");
      var pinned=read("oc-pinned-group:"+groupKey(h));
      var order=pinned?(-100000+base):base;
      h.setAttribute("data-oc-pinned",pinned?"true":"false");
      h.style.order=String(order);
      var body=h.nextElementSibling;
      if(!body)return;
      body.style.order=String(order);
      var rows=[].slice.call(body.querySelectorAll('[data-component="home-session-row-container"]'));
      rows.forEach(function(r,ri){
        if(!r.hasAttribute("data-oc-order"))r.setAttribute("data-oc-order",String(ri));
        var rb=+r.getAttribute("data-oc-order");
        var id=r.getAttribute("data-session-id");
        var rp=id&&read("oc-pinned-session:"+id);
        r.setAttribute("data-oc-pinned",rp?"true":"false");
        r.style.order=String(rp?(-100000+rb):rb);
      });
    });
  }
  function watchList(){
    var list=document.querySelector('[data-slot="home-sessions-list"]');
    if(!list){setTimeout(watchList,100);return}
    new MutationObserver(applyPinLayout).observe(list,{childList:true,subtree:true});
    applyPinLayout();
  }

  document.addEventListener("contextmenu",function(ev){
    if(window.__ocSkipMenu||!ev.target||!ev.target.closest)return;
    var header=ev.target.closest("[data-oc-group-key]");
    if(header){ev.preventDefault();ev.stopPropagation();groupMenu(header,groupKey(header),ev.clientX,ev.clientY,header.querySelector("[data-oc-chevron]"));return}
    var row=ev.target.closest('[data-component="home-session-row-container"]');
    if(row){ev.preventDefault();ev.stopPropagation();chatMenu(row,ev.clientX,ev.clientY)}
  },true);

  window.addEventListener("storage",function(ev){if(ev&&ev.key==="oc-refresh")applyPinLayout()});

  window.__ocEnhance={toggleGroup:toggleGroup,groupMenu:groupMenu,chatMenu:chatMenu,applyPinLayout:applyPinLayout,reorder:applyPinLayout,mark:applyPinLayout};
  applyPinLayout();
  watchList();
}`;

function replaceFunction(source, anchor, expected, replacement, label) {
  const start = source.indexOf(anchor);
  if (start < 0) {
    return { source, reason: `${label} not found` };
  }
  if (source.indexOf(anchor, start + 1) >= 0) {
    return { source, reason: `multiple ${label} functions` };
  }
  const end = findFunctionEnd(source, start);
  if (end < 0) {
    return { source, reason: `unbalanced ${label} function` };
  }
  if (!source.slice(start, end).includes(expected)) {
    return { source, reason: `${label} signature changed` };
  }
  return { source: source.slice(0, start) + replacement + source.slice(end) };
}

function patchUiAsset(source, options = {}) {
  const mode = normalizeMode(options.groupBy);
  if (mode === "none") {
    return { source, patched: false, mode, reason: "grouping disabled" };
  }

  const grouping = replaceFunction(
    source,
    "function pm(",
    "home.sessions.group.today",
    buildGroupingFunction(mode),
    "grouping function"
  );
  if (grouping.reason) {
    return { source, patched: false, mode, reason: grouping.reason };
  }

  const header = replaceFunction(
    grouping.source,
    "function gg(",
    "home-session-group-header",
    buildCollapseHeader(),
    "group header"
  );
  if (header.reason) {
    return { source: grouping.source, patched: true, mode, reason: header.reason };
  }

  return {
    source: header.source + "\n;(" + ENHANCER_SOURCE + ")();\n",
    patched: true,
    mode,
    collapse: true,
    pin: true,
  };
}

module.exports = {
  normalizeMode,
  findFunctionEnd,
  buildGroupingFunction,
  buildCollapseHeader,
  patchUiAsset,
};
