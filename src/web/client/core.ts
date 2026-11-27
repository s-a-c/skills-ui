import { LIST_WIDTH_MAX, LIST_WIDTH_MIN } from "../../core/prefs.ts";

export const CLIENT_CORE_JS = `
(function(){
'use strict';
/* Before first paint: gates the script-dependent hidden state (.js, gate 62). */
document.documentElement.classList.add('js');
var state = {
  prefs: window.__PREFS__,
  tab: 'installed',
  scope: 'project',
  skills: [],
  selected: null,
  selectedPath: null,
  checked: new Set(),
  query: '',
  results: [],
  searchFailed: false,
  busy: false,
  sortBy: 'checked',
  provFilter: 'all',
  capabilities: { healthCheck: false, postMutationHook: false },
  health: null,
  /* UI-07: update-check results are scope-keyed — same-name project/global
     rows are different rows, so each scope caches its own record and the
     render readers always see state.updates[state.scope]. */
  updates: { project: {}, global: {} },
  updateCheckDone: { project: false, global: false },
  updateCheckSeq: { project: 0, global: 0 },
  seedHold: false,
  queue: [],
  selectedSearchKey: null,
  sourceSkillsCache: {},
  agentFilter: null,
  backend: '',
  token: ''
};

function $(sel){ return document.querySelector(sel); }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
/* Hosted mode: the page was NOT served by skills-ui itself (GitHub Pages),
   so every call goes to a user-supplied loopback backend with the Bearer token. */
var HOSTED = !/^(127\\.0\\.0\\.1|localhost|\\[::1\\]|::1)$/.test(location.hostname);
var LS_BACKEND = 'skills-ui.backend';
var LS_TOKEN = 'skills-ui.token';
/* Session storage only (0.5.1 impl B): this page lives on a shared origin
   (s-a-c.github.io) — any sibling page could read a localStorage token and
   drive the local serve. sessionStorage is per-tab and clears on close. */
function storageGet(k){ try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v){ try { sessionStorage.setItem(k, v); } catch (e) {} }
function migrateLegacyStorage(){
  try {
    var b = localStorage.getItem(LS_BACKEND), t = localStorage.getItem(LS_TOKEN);
    if (b === null && t === null) return;
    if (b !== null && sessionStorage.getItem(LS_BACKEND) === null) sessionStorage.setItem(LS_BACKEND, b);
    if (t !== null && sessionStorage.getItem(LS_TOKEN) === null) sessionStorage.setItem(LS_TOKEN, t);
    localStorage.removeItem(LS_BACKEND);
    localStorage.removeItem(LS_TOKEN);
  } catch (e) {}
}

function api(path, opts){
  opts = opts || {};
  var url = path;
  if (HOSTED) {
    if (!state.backend) {
      return Promise.reject(new Error('Not connected: connect your local skills-ui serve first (Connect button, top right).'));
    }
    url = state.backend + path;
    opts.headers = Object.assign({}, opts.headers, { authorization: 'Bearer ' + state.token });
  }
  return fetch(url, opts).then(function(r){
    return r.json().then(function(body){
      if (!r.ok) throw new Error(body && body.error || ('HTTP ' + r.status));
      return body;
    });
  });
}

/* ---------- sounds (WebAudio synth; no audio assets) ---------- */
var audioCtx = null;
function tone(freq, start, dur, type, gainPeak){
  var ctx = audioCtx;
  var osc = ctx.createOscillator();
  var gain = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, ctx.currentTime + start);
  gain.gain.linearRampToValueAtTime(gainPeak || 0.06, ctx.currentTime + start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + dur + 0.05);
}
function play(kind){
  if (!state.prefs.sound) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (kind === 'select') tone(660, 0, 0.06, 'sine', 0.04);
    else if (kind === 'confirm') { tone(523, 0, 0.09); tone(784, 0.07, 0.12); }
    else if (kind === 'success') { tone(523, 0, 0.1); tone(659, 0.08, 0.1); tone(784, 0.16, 0.16); }
    else if (kind === 'error') { tone(170, 0, 0.14, 'square', 0.05); tone(140, 0.12, 0.14, 'square', 0.05); }
  } catch (e) { /* audio unavailable */ }
}

/* ---------- prefs ---------- */
var LIST_W_MIN = ${LIST_WIDTH_MIN}, LIST_W_MAX = ${LIST_WIDTH_MAX};
function clampListWidth(v){
  var n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(LIST_W_MIN, Math.min(LIST_W_MAX, Math.round(n)));
}
function applyListWidth(raw){
  var w = raw == null ? null : clampListWidth(raw);
  var mainEl = document.querySelector('main');
  var splitter = $('#listSplitter');
  var range = $('#listWidthRange');
  var valEl = $('#listWidthValue');
  if (mainEl) {
    if (w === null) mainEl.style.removeProperty('--list-col');
    else mainEl.style.setProperty('--list-col', w + '%');
  }
  var pct = w !== null ? w : 35;
  if (splitter) splitter.setAttribute('aria-valuenow', String(pct));
  if (range) range.value = String(pct);
  if (valEl) valEl.textContent = w === null ? 'Auto (35%)' : (w + '%');
}
function setPrefs(patch){
  state.prefs = Object.assign({}, state.prefs, patch);
  applyPrefs();
  api('/api/prefs', { method:'PUT', headers:{'content-type':'application/json'}, body: JSON.stringify(patch) })
    .catch(function(){ toast('Could not save preferences', 'error'); });
}
function applyPrefs(){
  document.documentElement.setAttribute('data-theme', state.prefs.theme);
  document.documentElement.setAttribute('data-motion', String(state.prefs.reduceMotion));
  ['auto','true','false'].forEach(function(v){
    var b = document.querySelector('[data-motion-choice="' + v + '"]');
    if (b) b.setAttribute('aria-pressed', String(String(state.prefs.reduceMotion) === v));
  });
  [['on', true], ['off', false]].forEach(function(pair){
    var b = document.querySelector('[data-sound-choice="' + pair[0] + '"]');
    if (b) b.setAttribute('aria-pressed', String(state.prefs.sound === pair[1]));
  });
  var themeToggle = $('#themeToggle');
  if (themeToggle) {
    var light = state.prefs.theme === 'latte';
    themeToggle.innerHTML = light ? ICONS.sun : ICONS.moon;
    themeToggle.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    themeToggle.setAttribute('title', light ? 'Switch to dark theme' : 'Switch to light theme');
  }
  var themeBtns = document.querySelectorAll('[data-theme-choice]');
  themeBtns.forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === state.prefs.theme)); });
  applyListWidth(state.prefs.listWidth);
}

/* ---------- toasts ---------- */
function toast(text, tone){
  var el = document.createElement('div');
  el.className = 'toast' + (tone ? ' ' + tone : '');
  el.setAttribute('role', 'status');
  el.textContent = text;
  $('#toasts').appendChild(el);
  setTimeout(function(){ el.remove(); }, 3900);
}
/* CLI output headed for a toast can be long — carry a clipped summary so the
   failed names up front stay readable. */
function clip(s, max){
  s = String(s == null ? '' : s);
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/* ---------- hosted connect (S-137) ---------- */
function probeBackend(base, token, onStatus){
  var url = base.replace(/\\/+$/, '');
  onStatus('Reaching ' + url + ' …');
  return fetch(url + '/api/version').then(function(r){
    if (r.status === 403) throw new Error('origin-not-allowed');
    if (!r.ok) throw new Error('unreachable');
    return r.json();
  }).then(function(v){
    if (!v.capabilities || !v.capabilities.hosted) throw new Error('old-binary');
    onStatus('Backend reachable, checking token …');
    return fetch(url + '/api/prefs', { headers: { authorization: 'Bearer ' + token } }).then(function(r2){
      if (r2.status === 401) throw new Error('bad-token');
      if (!r2.ok) throw new Error('unreachable');
      return r2.json().catch(function(){ return null; }).then(function(p){
        if (p && typeof p === 'object') {
          if (p.theme === 'mocha' || p.theme === 'latte') state.prefs.theme = p.theme;
          if (typeof p.sound === 'boolean') state.prefs.sound = p.sound;
          if (p.reduceMotion === 'auto' || typeof p.reduceMotion === 'boolean') state.prefs.reduceMotion = p.reduceMotion;
          if (p.listWidth === null || typeof p.listWidth === 'number') {
            state.prefs.listWidth = p.listWidth === null ? null : clampListWidth(p.listWidth);
          }
          applyPrefs();
        }
        return v;
      });
    });
  }).catch(function(e){
    var msg = e && e.message;
    if (msg === 'origin-not-allowed') {
      throw new Error("This page's origin is not in serve's allowlist. Restart serve with SKILLS_UI_ALLOWED_ORIGINS including " + location.origin + ".");
    }
    if (msg === 'old-binary') {
      throw new Error('Connected, but your skills-ui binary predates the hosted UI. Update the binary and restart serve.');
    }
    if (msg === 'bad-token') {
      throw new Error('Token rejected: re-copy the Hosted-UI token line from the serve startup output.');
    }
    var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari) {
      throw new Error('Safari blocks pages from reaching your local network. Use Chrome, Edge, or Firefox 153+.');
    }
    throw new Error('Cannot reach the backend. If the browser showed a local-network access prompt, choose Allow, then retry, and check the URL/port and that serve is running.');
  });
}
/* S-186: inline SVG icon set for the icon-only header buttons. The glyph
   carries the state (filled vs hollow connect dot, sun vs moon), the
   accessible label + title carry the words, and everything inherits
   currentColor so both themes read. Strings only: no backticks, no emoji
   glyphs (sloplint 30a). */
var ICONS = {
  dotOn: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="4" fill="currentColor"/></svg>',
  dotOff: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  sun: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3.25" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.25v2.25M8 12.5v2.25M1.25 8h2.25M12.5 8h2.25M3.35 3.35l1.6 1.6M11.05 11.05l1.6 1.6M12.65 3.35l-1.6 1.6M4.95 11.05l-1.6 1.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M14 9.5A6 6 0 1 1 6.5 2a4.5 4.5 0 0 0 7.5 7.5z" fill="currentColor"/></svg>'
};
function connectedDot(ok){
  var b = $('#connectState');
  if (!b) return;
  b.innerHTML = ok ? ICONS.dotOn : ICONS.dotOff;
  b.setAttribute('aria-pressed', String(ok));
}
function tryConnect(base, token){
  if (!base || !token) { $('#connectStatus').textContent = 'Both the backend URL and the token are needed.'; return; }
  setSemanticDisabled($('#connectBtn'), true);
  probeBackend(base, token, function(s){ $('#connectStatus').textContent = s; })
    .then(function(v){
      state.backend = base.replace(/\\/+$/, '');
      state.token = token;
      storageSet(LS_BACKEND, state.backend);
      storageSet(LS_TOKEN, token);
      $('#connectStatus').textContent = 'Connected to skills-ui ' + v.version + '.';
      $('#connectDialog').close();
      connectedDot(true);
      applyVersionCaps(v);
      boot();
    })
    .catch(function(e){ $('#connectStatus').textContent = e.message || String(e); connectedDot(false); })
    .finally(function(){ setSemanticDisabled($('#connectBtn'), false); });
}
function applyVersionCaps(v){
  var caps = (v && v.capabilities) || {};
  state.capabilities = {
    healthCheck: !!caps.healthCheck,
    postMutationHook: !!caps.postMutationHook
  };
  var wrap = $('#healthWrap');
  if (wrap) wrap.style.display = state.capabilities.healthCheck ? '' : 'none';
  if (state.capabilities.healthCheck) refreshHealth(false);
}
function renderHealth(){
  var pill = $('#healthPill'), sumEl = $('#healthSummary'), stEl = $('#healthPopStatus'), detEl = $('#healthDetails');
  if (!pill || !sumEl) return;
  var h = state.health;
  if (!h) {
    pill.removeAttribute('data-ok');
    sumEl.textContent = 'Health';
    if (stEl) stEl.textContent = 'Loading health status…';
    if (detEl) detEl.innerHTML = '';
    return;
  }
  pill.setAttribute('data-ok', String(!!h.ok));
  sumEl.textContent = h.summary || (h.ok ? 'healthy' : 'unhealthy');
  if (stEl) stEl.textContent = (h.summary || '') + (h.checkedAt ? ' · ' + h.checkedAt : '');
  if (detEl) {
    var list = Array.isArray(h.details) ? h.details : [];
    detEl.innerHTML = list.length ? list.map(function(d){ return '<li>' + esc(d) + '</li>'; }).join('') : '<li>No additional details.</li>';
  }
}
function refreshHealth(force){
  if (!state.capabilities || !state.capabilities.healthCheck) return Promise.resolve();
  return api('/api/health-check' + (force ? '?refresh=1' : ''))
    .then(function(d){
      state.health = d;
      if (d && d.configured === false && $('#healthWrap')) $('#healthWrap').style.display = 'none';
      renderHealth();
    })
    .catch(function(e){
      state.health = { ok: false, summary: 'health check error', details: [e && e.message ? e.message : String(e)], checkedAt: '' };
      renderHealth();
    });
}
function closeHealthPop(){
  var pop = $('#healthPop'), pill = $('#healthPill');
  if (pop) pop.classList.remove('open');
  if (pill) pill.setAttribute('aria-expanded', 'false');
}
function toggleHealthPop(){
  var pop = $('#healthPop'), pill = $('#healthPill');
  if (!pop || !pill) return;
  if (pop.classList.contains('open')) { closeHealthPop(); return; }
  renderHealth();
  pop.classList.add('open');
  pill.setAttribute('aria-expanded', 'true');
}
function handlePostMutation(res){
  if (res && res.hook && res.hook.configured && !res.hook.ok) {
    play('error');
    toast('Hook warning: ' + clip(res.hook.output || res.hook.summary || 'post-mutation hook failed', 200), 'error');
  }
  if (state.capabilities && state.capabilities.healthCheck) refreshHealth(true);
}
function openConnect(){
  var savedBase = state.backend, savedToken = state.token;
  savedBase = savedBase || storageGet(LS_BACKEND) || '';
  savedToken = savedToken || storageGet(LS_TOKEN) || '';
  $('#backendInput').value = savedBase;
  $('#tokenInput').value = savedToken;
  $('#connectStatus').textContent = '';
  $('#connectDialog').showModal();
}

/* ---------- busy ---------- */
/* UI-05 (S-206): ONE writer owns every .btn disabled state. state.busy is
   transient; data-semantic-disabled records independent reasons (already
   installed in this scope, already in the install list, connection probe in
   flight). Syncing recomputes disabled = busy OR semantic, so a busy reset
   can never re-enable a semantically disabled control, and every .btn
   created mid-flight (results, detail actions, seed actions) is reconciled
   by syncing after it is attached. Busy itself is never stored as a
   semantic reason — the attribute only ever describes an independent one. */
function syncButtonDisabled(button){
  button.disabled = state.busy ||
    button.getAttribute('data-semantic-disabled') === 'true';
}
function setSemanticDisabled(button, disabled){
  button.setAttribute('data-semantic-disabled', String(!!disabled));
  syncButtonDisabled(button);
}
function syncButtons(root){
  root.querySelectorAll('.btn').forEach(syncButtonDisabled);
}
function setBusy(label){
  state.busy = !!label;
  syncButtons(document);
  var bar = $('#busyBar');
  bar.style.display = label ? 'block' : 'none';
  $('#busyText').textContent = label || '';
}

/* ---------- accent chips per agent (high color) ---------- */
var ACCENTS = ['--a-mauve','--a-blue','--a-teal','--a-green','--a-peach','--a-red','--a-pink','--a-sapphire','--a-yellow','--a-flamingo'];
function chipColor(name){
  var h = 0;
  for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

`;
