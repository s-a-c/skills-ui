export const CLIENT_SEARCH_AND_BOOT_JS = `/* ---------- search ---------- */
var searchTimer = null;
var searchSeq = 0; /* S-182: monotonic token — a slow older response must never overwrite a newer render */
function searchKeyOf(r){ return (r.source || r.slug || '') + '#' + (r.name || ''); }
function inQueueKey(qk){ return state.queue.some(function(q){ return q.key === qk; }); }
function selectedSearchResult(){
  if (!state.selectedSearchKey) return null;
  for (var i = 0; i < state.results.length; i++) {
    if (searchKeyOf(state.results[i]) === state.selectedSearchKey) return state.results[i];
  }
  return null;
}
function sortedResults(){
  var items = (state.results || []).slice();
  if (state.sortBy === 'name') {
    items.sort(function(a, b){ return (a.name || '').localeCompare(b.name || ''); });
  } else if (state.sortBy === 'load') {
    items.sort(function(a, b){ return (Number(b.installs) || 0) - (Number(a.installs) || 0); });
  } else if (state.searchSortChecked) {
    items.sort(function(a, b){
      var ac = inQueueKey(searchKeyOf(a)) ? 0 : 1;
      var bc = inQueueKey(searchKeyOf(b)) ? 0 : 1;
      return ac - bc;
    });
  }
  return items;
}
function runSearch(){
  var q = $('#searchInput').value.trim();
  if (searchTimer) clearTimeout(searchTimer);
  if (!q) {
    searchSeq++; /* clearing the input is newer state — any in-flight search is now stale */
    state.results = []; state.searchFailed = false; state.selectedSearchKey = null;
    renderResults(); renderSelSummary();
    if (state.tab === 'search') showSearchDetail(null);
    /* clear only a search-owned busy slot — a non-search label (install etc.)
       in flight must survive clearing the input (S-182 review OPTIONAL 1) */
    if (($('#busyText').textContent || '').indexOf('Searching') === 0) setBusy(null);
    return;
  }
  searchTimer = setTimeout(function(){
    var seq = ++searchSeq; /* captured at dispatch… */
    if (!state.installedAll) refreshInstalledAll();
    setBusy('Searching skills.sh…');
    api('/api/search?q=' + encodeURIComponent(q))
      .then(function(d){
        if (seq !== searchSeq) return; /* …checked at resolve: stale, drop */
        state.results = d.results || [];
        state.searchFailed = !!d.failed;
        if (!selectedSearchResult()) {
          state.selectedSearchKey = state.results[0] ? searchKeyOf(state.results[0]) : null;
        }
        renderResults();
        renderSelSummary();
        if (state.tab === 'search') showSearchDetail(selectedSearchResult());
        if (d.adjustedQuery) toast('No exact matches, showing results for “' + d.adjustedQuery + '”', 'success');
      })
      .catch(function(e){ if (seq !== searchSeq) return; play('error'); toast(e.message, 'error'); })
      .finally(function(){ if (seq === searchSeq) setBusy(null); });
  }, 300);
}

function installedKey(source, name){ return (source || '') + '#' + (name || ''); }
function installedEntry(source, name){
  var pool = state.installedAll || state.skills;
  var key = installedKey(source, name);
  var hits = pool.filter(function(s){ return s.source && installedKey(s.source, s.name) === key; });
  return hits[0] || null;
}
function refreshInstalledAll(){
  return Promise.all([api('/api/skills?scope=project'), api('/api/skills?scope=global')])
    .then(function(rs){ state.installedAll = rs[0].skills.concat(rs[1].skills); })
    .catch(function(){ state.installedAll = state.skills; });
}
function installSingleSkill(source, name){
  play('confirm');
  setBusy('Installing ' + name + '…');
  var scopeBtn = document.querySelector('.scope-toggle button[aria-pressed="true"]');
  var installGlobal = scopeBtn ? scopeBtn.getAttribute('data-scope') === 'global' : false;
  return api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: source, skill: name, global: installGlobal }) })
    .then(function(res){
      if (res.ok) {
        play('success');
        toast('Installed ' + name, 'success');
        handlePostMutation(res);
        // A6: refresh the installed pools and re-render in place — the
        // installed chip and disabled button appear without a tab re-entry.
        return refreshInstalledAll().then(function(){
          renderResults();
          if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
        });
      }
      play('error');
      toast('Install failed for ' + name, 'error');
      handlePostMutation(res);
    })
    .catch(function(e){ play('error'); toast(e.message, 'error'); })
    .finally(function(){ setBusy(null); });
}
function addToQueue(source, name){
  var qk = source + '#' + name;
  if (inQueueKey(qk)) return;
  state.queue.push({ key: qk, source: source, name: name });
  play('confirm');
  toast('Added ' + name + ' to install list (' + state.queue.length + ')', 'success');
  renderResults(); renderSelSummary(); updateSearchTabBadge();
  if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
}
function removeFromQueue(qk){
  state.queue = state.queue.filter(function(x){ return x.key !== qk; });
  renderResults(); renderSelSummary(); updateSearchTabBadge();
  if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
}
function renderResults(){
  var list = $('#results');
  if (!list) return;
  list.innerHTML = '';
  var items = sortedResults();
  if (!items.length) {
    if (state.searchFailed) {
      list.innerHTML = '<div class="empty search-error">search failed: skills.sh unreachable</div>';
      return;
    }
    list.innerHTML = '<div class="empty">' + ($('#searchInput').value.trim() ? 'No results' : 'Type to search the skills.sh registry') + '</div>';
    return;
  }
  var scopeUpdates = state.updates[state.scope] || {};
  items.forEach(function(r, i){
    var li = document.createElement('li');
    var src = r.source || r.slug;
    var qk = searchKeyOf(r);
    li.style.setProperty('--i', i);
    li.setAttribute('data-key', qk);
    li.setAttribute('role', 'option');
    li.tabIndex = 0;
    var isSel = state.selectedSearchKey === qk;
    li.setAttribute('aria-selected', String(isSel));
    if (isSel) li.classList.add('selected');
    var installed = installedEntry(r.source, r.name);
    var sameScope = installed && installed.scope === state.scope;
    var up = sameScope ? scopeUpdates[r.name] : null;
    var inQueue = inQueueKey(qk);
    li.innerHTML =
      '<div class="skill-main">' +
      '<div class="result-head">' +
      '<span class="result-title-unit">' +
      '<input type="checkbox" class="result-check" aria-label="Select ' + esc(r.name) + '"' + (inQueue ? ' checked' : '') + '>' +
      '<span class="result-name">' + esc(r.name) + '</span>' +
      '</span>' +
      (installed ? '<span class="result-chip">' + (up && up.updateAvailable ? 'update available' : 'installed') + (sameScope ? ' · ' + esc(installed.scope) : '') + '</span>' : '') +
      '<span class="result-installs">' + esc(String(r.installs)) + ' installs</span></div>' +
      '<div class="result-foot">' +
      '<span class="result-source">' + esc(src) + '</span>' +
      '<div class="result-actions">' +
      /* UI-05: inQueue/sameScope are independent reasons recorded as
         semantic markers; the writer reconciles busy on top at append. */
      '<button class="btn btn-sm add-btn' + (inQueue ? ' added' : '') + '"' + (inQueue ? ' data-semantic-disabled="true" title="Already in your install list"' : '') + '>' +
      (inQueue ? '✓ In list' : '+ Add to list') + '</button>' +
      '<button class="btn btn-sm primary install-btn"' + (sameScope ? ' data-semantic-disabled="true" title="Already installed in ' + esc(state.scope) + ' scope"' : '') + '>' +
      (sameScope ? 'Installed' : 'Install') + '</button></div></div></div>';
    li.querySelector('.add-btn').addEventListener('click', function(ev){
      ev.stopPropagation();
      addToQueue(src, r.name);
    });
    li.querySelector('.install-btn').addEventListener('click', function(ev){
      ev.stopPropagation();
      installSingleSkill(src, r.name);
    });
    list.appendChild(li);
    syncButtons(li); /* UI-05: newly attached .btn nodes inherit busy/semantic state */
  });
}

function showSearchDetail(r){
  if (state.tab !== 'search') return;
  var pane = $('#detailPane');
  if (!pane) return;
  if (!r) {
    pane.innerHTML = '<div class="empty">Select a search result to inspect its source and install options.</div>';
    return;
  }
  var src = r.source || r.slug || '';
  var qk = searchKeyOf(r);
  var installed = installedEntry(r.source, r.name);
  var sameScope = installed && installed.scope === state.scope;
  var scopeUpdates = state.updates[state.scope] || {};
  var up = sameScope ? scopeUpdates[r.name] : null;
  var inQueue = inQueueKey(qk);
  var cachedSiblings = state.sourceSkillsCache[src];
  var siblingsHtml = '';
  if (Array.isArray(cachedSiblings)) {
    if (!cachedSiblings.length) {
      siblingsHtml = '<p class="hint">No sibling skills reported for ' + esc(src) + '.</p>';
    } else {
      siblingsHtml = '<div class="row" style="margin-bottom:8px;justify-content:space-between;align-items:center">' +
        '<strong>Skills in ' + esc(src) + ' (' + cachedSiblings.length + ')</strong>' +
        '<button class="btn btn-sm primary" id="installAllSourceBtn">Install all from source</button></div>' +
        '<div style="display:grid;gap:4px">' +
        cachedSiblings.map(function(sk){
          var sqk = src + '#' + sk.name;
          var sQueued = inQueueKey(sqk);
          var sInst = installedEntry(src, sk.name);
          var sSame = sInst && sInst.scope === state.scope;
          return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:var(--t-surface);border:1px solid var(--t-border);border-radius:6px">' +
            '<span style="font-weight:600;color:var(--t-text);font-size:13px">' + esc(sk.name) + '</span>' +
            (sInst ? '<span class="chip">installed' + (sSame ? ' · ' + esc(sInst.scope) : '') + '</span>' : '') +
            '<span style="flex:1;font-size:12px;color:var(--t-textMuted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sk.description || '') + '</span>' +
            '<button class="btn btn-sm sibling-queue-btn" data-sibling="' + esc(sk.name) + '"' + (sQueued ? ' data-semantic-disabled="true"' : '') + '>' + (sQueued ? '✓ In list' : '+ Add to list') + '</button>' +
            '</div>';
        }).join('') + '</div>';
    }
  } else if (src) {
    siblingsHtml = '<button class="btn" id="browseSourceBtn">Browse skills in ' + esc(src) + '</button>';
  }
  pane.innerHTML =
    '<div class="detail-head">' +
      '<div>' +
        '<h2 class="detail-title">' + esc(r.name) + '</h2>' +
        '<div class="detail-meta">' +
          '<span class="chip accent">' + esc(src) + '</span>' +
          '<span class="chip">' + esc(String(r.installs)) + ' installs</span>' +
          '<span class="chip">target: ' + esc(state.scope) + '</span>' +
          (installed ? '<span class="chip">installed (' + esc(installed.scope) + ')</span>' : '') +
          (up && up.updateAvailable ? '<span class="chip update" title="' + esc((up.installedHash || '').slice(0, 7) + ' → ' + (up.upstreamHash || '').slice(0, 7)) + '">update available</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="detail-actions">' +
        '<button class="btn" id="detailQueueToggleBtn">' + (inQueue ? 'Remove from list' : '+ Add to list') + '</button>' +
        '<button class="btn primary" id="detailInstallBtn"' + (sameScope ? ' data-semantic-disabled="true" title="Already installed in ' + esc(state.scope) + ' scope"' : '') + '>' + (sameScope ? 'Installed' : 'Install') + '</button>' +
        (sameScope ? '<button class="btn' + (up && up.updateAvailable ? ' primary' : '') + '" id="detailUpdateBtn">Update</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="md">' +
      '<p>Registry skill <code>' + esc(r.name) + '</code> from <code>' + esc(src) + '</code> (' + esc(String(r.installs)) + ' recorded installs on skills.sh).</p>' +
      '<div id="sourceSkillsBox" style="margin-top:16px">' + siblingsHtml + '</div>' +
    '</div>';
  syncButtons(pane);
  var qBtn = $('#detailQueueToggleBtn');
  if (qBtn) {
    qBtn.addEventListener('click', function(){
      if (inQueueKey(qk)) removeFromQueue(qk);
      else addToQueue(src, r.name);
    });
  }
  var iBtn = $('#detailInstallBtn');
  if (iBtn) {
    iBtn.addEventListener('click', function(){ installSingleSkill(src, r.name); });
  }
  var uBtn = $('#detailUpdateBtn');
  if (uBtn) {
    uBtn.addEventListener('click', function(){ updateSkills([r.name], state.scope === 'global'); });
  }
  var bBtn = $('#browseSourceBtn');
  if (bBtn) {
    bBtn.addEventListener('click', function(){
      setBusy('Discovering skills in ' + src + '…');
      api('/api/source-skills?source=' + encodeURIComponent(src))
        .then(function(d){
          state.sourceSkillsCache[src] = d.skills || [];
          if (state.tab === 'search' && state.selectedSearchKey === qk) showSearchDetail(r);
        })
        .catch(function(e){ play('error'); toast(e.message, 'error'); })
        .finally(function(){ setBusy(null); });
    });
  }
  var allSrcBtn = $('#installAllSourceBtn');
  if (allSrcBtn) {
    allSrcBtn.addEventListener('click', function(){
      setBusy('Installing all skills from ' + src + '…');
      api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: src, skills: ['*'], global: state.scope === 'global' }) })
        .then(function(res){
          if (res.ok) {
            play('success');
            toast('Installed skills from ' + src, 'success');
            handlePostMutation(res);
            refreshInstalledAll().then(function(){
              renderResults();
              if (state.tab === 'search' && state.selectedSearchKey === qk) showSearchDetail(r);
            });
          } else {
            play('error');
            toast(clip(res.output, 240) || 'Install failed', 'error');
            handlePostMutation(res);
          }
        })
        .catch(function(e){ play('error'); toast(e.message, 'error'); })
        .finally(function(){ setBusy(null); });
    });
  }
  pane.querySelectorAll('.sibling-queue-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      var sName = btn.getAttribute('data-sibling');
      if (sName) addToQueue(src, sName);
    });
  });
}

/* ---------- install queue ---------- */
function updateSearchTabBadge(){
  var searchTab = document.querySelector('[data-tab="search"]');
  if (searchTab) searchTab.textContent = 'Search' + (state.queue.length ? ' (' + state.queue.length + ')' : '');
  var iqBtn = $('#installQueueBtn');
  if (iqBtn) {
    iqBtn.style.display = state.queue.length ? '' : 'none';
    iqBtn.textContent = 'Install selected (' + state.queue.length + ')';
  }
}
function installQueue(){
  var groups = new Map();
  state.queue.forEach(function(q){
    var names = groups.get(q.source) || [];
    names.push(q.name);
    groups.set(q.source, names);
  });
  var entries = Array.from(groups.entries());
  var total = state.queue.length;
  var done = 0, failed = 0;
  /* S-202: capture the scope ONCE before the next() recursion — the scope
     toggle stays usable while the list installs, so every request body must
     carry the start-of-batch scope, never the live state.scope. */
  var installGlobally = state.scope === 'global';
  var next = function(){
    if (!entries.length) {
      state.queue = [];
      renderResults(); renderSelSummary(); updateSearchTabBadge();
      if (failed) { play('error'); toast('Installed ' + (total - failed) + ', failed ' + failed, 'error'); }
      else { play('success'); toast('Installed ' + total + ' skill' + (total === 1 ? '' : 's'), 'success'); }
      refreshInstalledAll().then(function(){
        renderResults();
        if (state.tab === 'search' && state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      });
      loadSkills();
      return;
    }
    var entry = entries.shift();
    setBusy('Installing ' + entry[1].join(', ') + '…');
    api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: entry[0], skills: entry[1], global: installGlobally }) })
      .then(function(res){
        handlePostMutation(res);
        if (res.ok) done += entry[1].length; else failed += entry[1].length;
      })
      .catch(function(){ failed += entry[1].length; })
      .finally(function(){ setBusy(null); next(); });
  };
  play('confirm');
  next();
}

/* ---------- tabs, scope, settings ---------- */
function setTab(tab){
  cancelFilterRender(); // S-180: a pending filter render must not fire into another view
  state.tab = tab;
  document.querySelectorAll('.tab').forEach(function(t){ t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === tab)); });
  updateSearchTabBadge();
  document.body.classList.toggle('view-search', tab === 'search');
  var isSearch = tab === 'search';
  $('#listPane').setAttribute('aria-label', isSearch ? 'Registry search' : 'Installed skills');
  $('#filter').style.display = isSearch ? 'none' : '';
  $('#agentsWrap').style.display = isSearch ? 'none' : '';
  $('#searchInput').style.display = isSearch ? '' : 'none';
  $('#provRow').style.display = isSearch ? 'none' : '';
  $('#skillList').style.display = isSearch ? 'none' : '';
  $('#results').style.display = isSearch ? '' : 'none';
  var loadSortBtn = document.querySelector('[data-sort="load"]');
  if (loadSortBtn) loadSortBtn.textContent = isSearch ? 'Installs' : 'Load order';
  renderSelSummary();
  if (isSearch) {
    $('#searchInput').focus();
    showSearchDetail(selectedSearchResult());
    refreshInstalledAll().then(function(){
      if (state.results.length) {
        renderResults();
        if (state.tab === 'search') showSearchDetail(selectedSearchResult());
      }
    });
  } else if (tab === 'installed') {
    loadSkills().then(function(){ return checkForUpdates(false); });
  }
}

function uniqueAgents(){
  var set = new Set();
  state.skills.forEach(function(s){ (s.agents || []).forEach(function(a){ set.add(a); }); });
  return Array.from(set).sort();
}
function agentsActive(){ return state.agentFilter && state.agentFilter.size > 0; }
function renderAgentsPop(){
  var list = $('#agentsList');
  list.innerHTML = '';
  var agents = uniqueAgents();
  agents.forEach(function(a){
    var row = document.createElement('label');
    var checked = state.agentFilter ? state.agentFilter.has(a) : true;
    row.innerHTML = '<input type="checkbox" value="' + esc(a) + '"' + (checked ? ' checked' : '') + '><span>' + esc(a) + '</span>';
    row.querySelector('input').addEventListener('change', function(ev){
      if (!state.agentFilter) state.agentFilter = new Set(uniqueAgents());
      if (ev.target.checked) state.agentFilter.add(a); else state.agentFilter.delete(a);
      if (state.agentFilter.size === uniqueAgents().length) state.agentFilter = null;
      renderList(); renderSelSummary();
    });
    list.appendChild(row);
  });
  if (!agents.length) list.innerHTML = '<div class="empty">No agents in installed skills.</div>';
  var btn = $('#agentsBtn');
  btn.textContent = agentsActive() ? 'Agents (' + state.agentFilter.size + ')' : 'Agents';
}
function toggleAgentsPop(){
  var pop = $('#agentsPop');
  if (pop.classList.contains('open')) { closeAgentsPop(); return; }
  renderAgentsPop();
  pop.classList.add('open');
}
function closeAgentsPop(){ $('#agentsPop').classList.remove('open'); }

function renderSelSummary(){
  var isSearch = state.tab === 'search';
  var n = isSearch ? state.queue.length : state.checked.size;
  /* S-187: count + Clear ride the Select all line (right-aligned); the row
     itself is permanent, so only the summary shows or hides. */
  $('#selSummary').classList.toggle('on', n > 0);
  $('#selCount').textContent = n;
  /* S-186: the selected-scope actions live in the top bar; they show only
     while a selection exists. */
  $('#updateCheckedBtn').style.display = (!isSearch && n) ? '' : 'none';
  $('#deleteCheckedBtn').style.display = (!isSearch && n) ? '' : 'none';
  updateSearchTabBadge();
  syncSelectAll();
}
/* S-186: the Select all master mirrors the active mode's visible set. Checked
   when every row is checked, indeterminate when some are, unchecked when none
   are. Runs on every render pass and every selection change. */
function syncSelectAll(){
  var box = $('#selectAllMaster');
  if (!box) return;
  if (state.tab === 'search') {
    var rItems = state.results || [];
    var rn = 0;
    rItems.forEach(function(r){ if (inQueueKey(searchKeyOf(r))) rn++; });
    var rAll = rItems.length > 0 && rn === rItems.length;
    box.checked = rAll;
    box.indeterminate = rn > 0 && !rAll;
    return;
  }
  var items = filteredSkills();
  var n = 0;
  items.forEach(function(s){ if (state.checked.has(s.name)) n++; });
  var all = items.length > 0 && n === items.length;
  box.checked = all;
  box.indeterminate = n > 0 && !all;
}
function setScope(scope){
  cancelFilterRender(); // S-180: a pending filter render must not fire into the other scope
  state.checked.clear();
  detailSeq++; /* S-204: a scope switch orphans any detail still in flight */
  state.scope = scope;
  document.querySelectorAll('[data-scope]').forEach(function(b){ b.setAttribute('aria-pressed', String(b.getAttribute('data-scope') === scope)); });
  renderSelSummary();
  play('select');
  if (state.tab === 'search') {
    renderResults();
    if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
  }
  loadSkills();
}

function openSettings(open){
  $('#settings').classList.toggle('open', open);
  $('#scrim').classList.toggle('open', open);
}

/* ---------- wire up ---------- */
document.addEventListener('DOMContentLoaded', function(){
  document.querySelectorAll('.tab').forEach(function(t){
    t.addEventListener('click', function(){ setTab(t.getAttribute('data-tab')); play('select'); });
  });
  $('#installQueueBtn').addEventListener('click', installQueue);
  document.querySelectorAll('[data-scope]').forEach(function(b){
    b.addEventListener('click', function(){ setScope(b.getAttribute('data-scope')); });
  });
  $('#settingsBtn').addEventListener('click', function(){ openSettings(true); play('select'); });
  $('#settingsClose').addEventListener('click', function(){ openSettings(false); });
  $('#scrim').addEventListener('click', function(){ openSettings(false); });
  $('#updateCheckedBtn').addEventListener('click', function(){
    updateSkills(Array.from(state.checked), state.scope === 'global');
  });
  $('#deleteCheckedBtn').addEventListener('click', deleteChecked);
  $('#clearCheckedBtn').addEventListener('click', function(){
    if (state.tab === 'search') {
      state.queue = [];
      renderResults();
      renderSelSummary();
      updateSearchTabBadge();
      if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      return;
    }
    state.checked.clear(); renderList(); renderSelSummary();
  });
  $('#agentsBtn').addEventListener('click', function(){ toggleAgentsPop(); });
  $('#agentsAll').addEventListener('click', function(){
    state.agentFilter = null; renderAgentsPop(); renderList(); renderSelSummary();
  });
  $('#agentsClear').addEventListener('click', function(){
    state.agentFilter = new Set(); renderAgentsPop(); renderList(); renderSelSummary();
  });
  $('#agentsDone').addEventListener('click', function(){ closeAgentsPop(); });
  $('#helpBtn').addEventListener('click', function(){ $('#helpDialog').showModal(); });
  $('#helpClose').addEventListener('click', function(){ $('#helpDialog').close(); });
  $('#connectBtn').addEventListener('click', function(){
    tryConnect($('#backendInput').value.trim(), $('#tokenInput').value.trim());
  });
  $('#connectState').addEventListener('click', openConnect);
  /* S-186: the master checkbox replaces the Select all button. Semantics
     preserved from the button for the add direction (every visible row,
     render + selection bar refreshed); all-checked now toggles off. */
  $('#selectAllMaster').addEventListener('change', function(){
    if (state.tab === 'search') {
      var rItems = state.results || [];
      var rAll = rItems.length > 0 && rItems.every(function(r){ return inQueueKey(searchKeyOf(r)); });
      rItems.forEach(function(r){
        var qk = searchKeyOf(r);
        if (rAll) {
          state.queue = state.queue.filter(function(q){ return q.key !== qk; });
        } else if (!inQueueKey(qk)) {
          state.queue.push({ key: qk, source: r.source || r.slug, name: r.name });
        }
      });
      play('confirm');
      renderResults(); renderSelSummary(); updateSearchTabBadge();
      if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      return;
    }
    var items = filteredSkills();
    var all = items.length > 0 && items.every(function(s){ return state.checked.has(s.name); });
    items.forEach(function(s){
      if (all) state.checked.delete(s.name); else state.checked.add(s.name);
    });
    play('confirm');
    renderList(); renderSelSummary();
  });
  document.querySelectorAll('[data-sort]').forEach(function(b){
    b.addEventListener('click', function(){
      state.sortBy = b.getAttribute('data-sort');
      state.searchSortChecked = (state.sortBy === 'checked');
      document.querySelectorAll('[data-sort]').forEach(function(x){
        x.setAttribute('aria-pressed', String(x.getAttribute('data-sort') === state.sortBy));
      });
      play('select');
      if (state.tab === 'search') renderResults();
      else renderList();
    });
  });
  document.querySelectorAll('[data-prov]').forEach(function(b){
    b.addEventListener('click', function(){
      state.provFilter = b.getAttribute('data-prov') || 'all';
      document.querySelectorAll('[data-prov]').forEach(function(x){
        x.setAttribute('aria-pressed', String(x.getAttribute('data-prov') === state.provFilter));
      });
      play('select');
      renderList(); renderSelSummary();
    });
  });
  var healthPill = $('#healthPill');
  if (healthPill) healthPill.addEventListener('click', toggleHealthPop);
  var healthRefreshBtn = $('#healthRefreshBtn');
  if (healthRefreshBtn) healthRefreshBtn.addEventListener('click', function(){ refreshHealth(true); });
  var healthCloseBtn = $('#healthCloseBtn');
  if (healthCloseBtn) healthCloseBtn.addEventListener('click', closeHealthPop);
  /* S-180: row events are delegated on the persistent list — row nodes are
     reused across renders, so per-row listeners would be re-attached (or
     dropped) on every reconcile. Semantics match the old per-row handlers:
     a checkbox click never selects the row; its change updates the checked
     set; Enter/Space on a row selects it. */
  var skillListEl = $('#skillList');
  skillListEl.addEventListener('click', function(ev){
    if (ev.target.closest && ev.target.closest('.skill-check')) { ev.stopPropagation(); return; }
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (li) { selectSkill(rowNameOf(li)); play('select'); }
  });
  skillListEl.addEventListener('change', function(ev){
    var box = ev.target;
    if (!box.classList || !box.classList.contains('skill-check')) return;
    var li = box.closest ? box.closest('li[data-key]') : null;
    if (!li) return;
    var name = rowNameOf(li);
    if (box.checked) state.checked.add(name); else state.checked.delete(name);
    /* S-186: this handler mutates the checked set OUTSIDE renderList, so the
       row's stored signature must follow it: rowSignature includes 'c' for a
       checked row. A stale __sig made the next reconcile (Clear, and the
       update/remove flows) diff two equal signatures and skip the refresh,
       leaving boxes visually checked after state.checked.clear(). */
    for (var si = 0; si < state.skills.length; si++) {
      if (state.skills[si].name === name) { li.__sig = rowSignature(state.skills[si]); break; }
    }
    renderSelSummary();
    play('select');
  });
  skillListEl.addEventListener('keydown', function(ev){
    /* UI-06 (S-207): an interactive descendant (the row checkbox) owns its own
       keys — Space must reach the NATIVE checkbox toggle, so the delegated
       row handler returns before its preventDefault and the existing change
       handler above keeps owning the checked summary. */
    if (ev.target instanceof Element &&
        ev.target.closest('input,button,a,select,textarea,[contenteditable]')) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (!li) return;
    ev.preventDefault();
    selectSkill(rowNameOf(li));
    play('select');
  });

  var resultsEl = $('#results');
  resultsEl.addEventListener('click', function(ev){
    if (ev.target.closest && ev.target.closest('input,button,a')) return;
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (!li) return;
    var qk = li.getAttribute('data-key');
    state.selectedSearchKey = qk;
    resultsEl.querySelectorAll('li[data-key]').forEach(function(node){
      var isSel = node.getAttribute('data-key') === qk;
      node.classList.toggle('selected', isSel);
      node.setAttribute('aria-selected', String(isSel));
    });
    showSearchDetail(selectedSearchResult());
    play('select');
  });
  resultsEl.addEventListener('change', function(ev){
    var box = ev.target;
    if (!box.classList || !box.classList.contains('result-check')) return;
    var li = box.closest ? box.closest('li[data-key]') : null;
    if (!li) return;
    var qk = li.getAttribute('data-key');
    var hit = null;
    for (var i = 0; i < state.results.length; i++) {
      if (searchKeyOf(state.results[i]) === qk) { hit = state.results[i]; break; }
    }
    if (!hit) return;
    if (box.checked) addToQueue(hit.source || hit.slug, hit.name);
    else { removeFromQueue(qk); play('select'); }
  });
  resultsEl.addEventListener('keydown', function(ev){
    if (ev.target instanceof Element &&
        ev.target.closest('input,button,a,select,textarea,[contenteditable]')) return;
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var li = ev.target.closest ? ev.target.closest('li[data-key]') : null;
    if (!li) return;
    ev.preventDefault();
    var qk = li.getAttribute('data-key');
    state.selectedSearchKey = qk;
    resultsEl.querySelectorAll('li[data-key]').forEach(function(node){
      var isSel = node.getAttribute('data-key') === qk;
      node.classList.toggle('selected', isSel);
      node.setAttribute('aria-selected', String(isSel));
    });
    showSearchDetail(selectedSearchResult());
    play('select');
  });

  /* S-238: user-adjustable #listPane width via #listSplitter + #settings */
  var listWidthSaveTimer = null;
  function persistListWidthDebounced(px){
    if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
    listWidthSaveTimer = setTimeout(function(){
      listWidthSaveTimer = null;
      setPrefs({ listWidth: px });
    }, 150);
  }
  var splitter = $('#listSplitter');
  var mainEl = document.querySelector('main');
  if (splitter && mainEl) {
    var dragging = false;
    splitter.addEventListener('pointerdown', function(ev){
      if (ev.button && ev.button !== 0) return;
      ev.preventDefault();
      dragging = true;
      splitter.classList.add('dragging');
      if (splitter.setPointerCapture && ev.pointerId != null) {
        try { splitter.setPointerCapture(ev.pointerId); } catch (_) {}
      }
    });
    splitter.addEventListener('pointermove', function(ev){
      if (!dragging) return;
      var rect = mainEl.getBoundingClientRect();
      if (!rect.width) return;
      var w = clampListWidth(((ev.clientX - rect.left) / rect.width) * 100);
      if (w != null) {
        state.prefs.listWidth = w;
        applyListWidth(w);
      }
    });
    var endDrag = function(ev){
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      if (splitter.releasePointerCapture && ev && ev.pointerId != null) {
        try { splitter.releasePointerCapture(ev.pointerId); } catch (_) {}
      }
      setPrefs({ listWidth: state.prefs.listWidth });
    };
    splitter.addEventListener('pointerup', endDrag);
    splitter.addEventListener('pointercancel', endDrag);
    splitter.addEventListener('dblclick', function(){
      if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
      setPrefs({ listWidth: null });
      play('confirm');
    });
    splitter.addEventListener('keydown', function(ev){
      var step = ev.shiftKey ? 5 : 1;
      var cur = state.prefs.listWidth != null ? state.prefs.listWidth : 35;
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        var nextW = clampListWidth(cur + (ev.key === 'ArrowRight' ? step : -step));
        state.prefs.listWidth = nextW;
        applyListWidth(nextW);
        persistListWidthDebounced(nextW);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        state.prefs.listWidth = LIST_W_MIN;
        applyListWidth(LIST_W_MIN);
        persistListWidthDebounced(LIST_W_MIN);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        state.prefs.listWidth = LIST_W_MAX;
        applyListWidth(LIST_W_MAX);
        persistListWidthDebounced(LIST_W_MAX);
      } else if (ev.key === '0' || ev.key === 'Backspace' || ev.key === 'Delete') {
        ev.preventDefault();
        if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
        setPrefs({ listWidth: null });
      }
    });
  }
  var listWidthRange = $('#listWidthRange');
  if (listWidthRange) {
    listWidthRange.addEventListener('input', function(ev){
      var w = clampListWidth(Number(ev.target.value));
      if (w != null) {
        state.prefs.listWidth = w;
        applyListWidth(w);
        persistListWidthDebounced(w);
      }
    });
  }
  var listWidthReset = $('#listWidthReset');
  if (listWidthReset) {
    listWidthReset.addEventListener('click', function(){
      if (listWidthSaveTimer) clearTimeout(listWidthSaveTimer);
      setPrefs({ listWidth: null });
      play('confirm');
    });
  }

  /* S-180: the filter render is debounced (trailing edge) — the listener
     only arms the timer; no filtering happens until it fires. */
  $('#filter').addEventListener('input', scheduleFilterRender);
  $('#filter').addEventListener('keydown', function(ev){ if (ev.key === 'Escape') { ev.preventDefault(); ev.target.blur(); } }); // Esc keeps the text + the applied filter
  $('#searchInput').addEventListener('input', runSearch);
  $('#updateAllBtn').addEventListener('click', function(){ updateSkills([], state.scope === 'global'); });
  $('#checkUpdatesBtn').addEventListener('click', function(){ checkForUpdates(true); });

  document.querySelectorAll('[data-theme-choice]').forEach(function(b){
    b.addEventListener('click', function(){ setPrefs({ theme: b.getAttribute('data-theme-choice') }); play('confirm'); });
  });
  $('#themeToggle').addEventListener('click', function(){
    setPrefs({ theme: state.prefs.theme === 'mocha' ? 'latte' : 'mocha' });
    play('confirm');
  });
  document.querySelectorAll('[data-sound-choice]').forEach(function(b){
    b.addEventListener('click', function(){
      var on = b.getAttribute('data-sound-choice') === 'on';
      setPrefs({ sound: on });
      if (on) play('confirm');
    });
  });
  document.querySelectorAll('[data-motion-choice]').forEach(function(b){
    b.addEventListener('click', function(){
      var v = b.getAttribute('data-motion-choice');
      setPrefs({ reduceMotion: v === 'auto' ? 'auto' : v === 'true' });
      play('confirm');
    });
  });

  var portInput = $('#portInput');
  if (portInput) {
    // Default to the port actually serving this session.
    portInput.value = window.__PORT__ || '';
    $('#portNow').textContent = window.__PORT__ ? 'port ' + window.__PORT__ : 'a random port';
    portInput.addEventListener('change', function(){
      var raw = portInput.value.trim();
      if (!raw) {
        setPrefs({ port: null });
        play('confirm');
        toast('Port cleared: next launch picks a random unused port', 'success');
        return;
      }
      var n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 65535) {
        play('error');
        toast('Port must be a whole number from 1 to 65535', 'error');
        portInput.value = window.__PORT__ || '';
        return;
      }
      setPrefs({ port: n });
      play('confirm');
      toast('Port ' + n + ' saved, applies on next launch', 'success');
    });
  }

  $('#confirmNo').addEventListener('click', function(){ $('#confirmDialog').close(); });

  // click ripple
  document.addEventListener('click', function(ev){
    var btn = ev.target.closest ? ev.target.closest('.btn') : null;
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var rip = document.createElement('span');
    rip.className = 'ripple';
    var size = Math.max(rect.width, rect.height);
    rip.style.width = rip.style.height = size + 'px';
    rip.style.left = (ev.clientX - rect.left - size / 2) + 'px';
    rip.style.top = (ev.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(rip);
    setTimeout(function(){ rip.remove(); }, 550);
  });

  renderSelSummary();
  document.addEventListener('keydown', function(ev){
    var key = ev.key;
    var typing = /^(input|textarea|select)$/i.test((ev.target.tagName || ''));
    if (key === 'Escape') {
      if ($('#helpDialog').open) { $('#helpDialog').close(); return; }
      if ($('#healthPop') && $('#healthPop').classList.contains('open')) { closeHealthPop(); return; }
      if ($('#agentsPop').classList.contains('open')) { closeAgentsPop(); return; }
      if ($('#settings').classList.contains('open')) { openSettings(false); return; }
      if (ev.target === $('#filter')) { ev.target.blur(); return; } // keep applied filter
      if (ev.target === $('#searchInput')) { ev.preventDefault(); ev.target.blur(); return; } // Esc keeps the query + the rendered results
      return;
    }
    if (typing) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (key === '/') {
      ev.preventDefault();
      document.querySelector('[data-tab="search"]').click();
      $('#searchInput').focus();
    } else if (key === 'f') {
      ev.preventDefault();
      if (state.tab !== 'installed') setTab('installed');
      $('#filter').focus();
    } else if (key === '?') {
      ev.preventDefault();
      $('#helpDialog').showModal();
    } else if (key === 'g' || key === 'p') {
      var scope = key === 'g' ? 'global' : 'project';
      var btn = document.querySelector('[data-scope="' + scope + '"]');
      if (btn && btn.getAttribute('aria-pressed') !== 'true') btn.click();
    } else if (key === 'a') {
      ev.preventDefault();
      if (state.tab !== 'installed') setTab('installed');
      toggleAgentsPop();
    } else if (key === 'i') {
      ev.preventDefault();
      if (state.tab !== 'installed') setTab('installed');
    } else if (key === 'x') {
      ev.preventDefault();
      openSettings(true);
    }
  });
  document.addEventListener('click', function(ev){
    var wrap = document.querySelector('#agentsWrap');
    if (wrap && !wrap.contains(ev.target)) closeAgentsPop();
    var hWrap = document.querySelector('#healthWrap');
    if (hWrap && !hWrap.contains(ev.target)) closeHealthPop();
  });

  applyPrefs();
  if (HOSTED) {
    $('#connectState').style.display = '';
    migrateLegacyStorage();
    var savedBase = storageGet(LS_BACKEND), savedToken = storageGet(LS_TOKEN);
    if (savedBase && savedToken) {
      probeBackend(savedBase, savedToken, function(){})
        .then(function(v){
          state.backend = savedBase; state.token = savedToken;
          connectedDot(true);
          applyVersionCaps(v);
          boot();
        })
        .catch(function(){ connectedDot(false); openConnect(); });
    } else {
      connectedDot(false);
      openConnect();
    }
  } else {
    api('/api/version').then(applyVersionCaps).catch(function(){});
    boot();
  }
});

function boot(){
  setTab('installed');
  applySeed();
}
})();
`;
