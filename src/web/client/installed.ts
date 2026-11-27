export function buildClientInstalledJs(skillMatchesSrc: string): string {
  return `/* ---------- installed list ---------- */
var skillsLoadSeq=0;
function loadSkills(){
  var scope=state.scope,seq=++skillsLoadSeq;
  function owns(){return seq===skillsLoadSeq&&scope===state.scope;}
  setBusy('Loading skills…');
  return api('/api/skills?scope='+scope).then(function(data){
    if(!owns())return;
    state.skills=data.skills;renderList();
    if(state.tab!=='installed')return;
    if(!data.skills.length){
      detailSeq++; /* S-204: the empty pane replaces any detail still in flight */
      $('#detailPane').innerHTML='<div class="empty">No '+scope+' skills installed.<br>Open the <b>Search</b> tab to install one.</div>';
    }else if(!state.seedHold&&(state.selected==null||!data.skills.some(function(s){return s.name===state.selected;}))){
      selectSkill(data.skills[0].name);
    }else if(!state.seedHold){showDetail(state.selected);}
  }).catch(function(e){if(owns())toast(e.message,'error');})
    .finally(function(){if(owns())setBusy(null);});
}

/* Filter predicate: the transpiled source of skillMatches() from
   src/web/page.ts — the SAME match set the TUI runs (name, source,
   agents, description). One definition, two surfaces; the parity test
   in tests/filter-parity.test.ts proves it. */
${skillMatchesSrc}
function filteredSkills(){
  var needle = ($('#filter').value || '').trim().toLowerCase();
  var prov = state.provFilter || 'all';
  var items = state.skills.filter(function(s){
    var agentOk = !state.agentFilter || state.agentFilter.size === 0 ||
      s.agents.some(function(a){ return state.agentFilter.has(a); });
    if (!agentOk) return false;
    if (prov !== 'all' && (s.provenance || 'local') !== prov) return false;
    return skillMatches(s, needle);
  });
  if (state.sortBy === 'checked') {
    items = items.slice().sort(function(a, b){
      var ca = state.checked.has(a.name) ? 0 : 1;
      var cb = state.checked.has(b.name) ? 0 : 1;
      return ca - cb || a.name.localeCompare(b.name);
    });
  } else if (state.sortBy === 'name') {
    items = items.slice().sort(function(a, b){ return a.name.localeCompare(b.name); });
  }
  /* 'load' deliberately sorts nothing — CLI load order = state.skills order */
  return items;
}
/* ---------- S-180 DOM-reuse render ----------
   Rows are keyed (scope + '/' + skill name) and persist across renders: a
   keystroke reconciles — create missing rows, remove gone ones, refresh
   changed content in place — instead of innerHTML='' rebuilding ~390 li
   plus ~1.6k listeners per keystroke. The entrance stagger (.rise-in) is
   stamped on the first population that actually paints rows per page load
   and never re-stamped: later populations — scope switches, filter
   renders, reorders, selection flips — replay nothing. Row-node identity
   holds within a non-empty result set; rows filtered all the way out are
   discarded, so widening the needle again recreates them (by design, and
   without animation). Content refreshes are keyed off rowSignature only:
   a needle change over the same result set touches no DOM at all. */
var rowByKey = {};
var listIntroPending = true;
var filterTimer = null;
var FILTER_DEBOUNCE_MS = 150;
function cancelFilterRender(){
  if (filterTimer) { clearTimeout(filterTimer); filterTimer = null; }
}
function scheduleFilterRender(){
  cancelFilterRender();
  filterTimer = setTimeout(function(){
    filterTimer = null;
    /* Bound the User Timing buffers: each pass emits 2 marks + 1 measure
       and nothing else clears them, so a long session would fill the
       finite entry buffers and silently kill instrumentation. Probes only
       read entries with startTime >= their own t0, so clearing the three
       names at the top of every pass is safe. */
    performance.clearMarks('skills-ui:filter-render-start');
    performance.clearMarks('skills-ui:filter-render-end');
    performance.clearMeasures('skills-ui:filter-render');
    /* S-180 perf instrumentation: standard User Timing marks around every
       debounced render pass — the budget harness (scripts/perf) reads the
       skills-ui:filter-render measure entry to charge the RENDER WORK,
       excluding this debounce wait and the browser's frame pacing. Zero
       behavioral impact; inert unless something reads the entries. */
    performance.mark('skills-ui:filter-render-start');
    try {
      renderList();
    } finally {
      performance.mark('skills-ui:filter-render-end');
      performance.measure('skills-ui:filter-render', 'skills-ui:filter-render-start', 'skills-ui:filter-render-end');
    }
  }, FILTER_DEBOUNCE_MS);
}
function rowKeyFor(name){ return state.scope + '/' + name; }
function rowNameOf(li){
  var key = li.getAttribute('data-key') || '';
  return key.slice(state.scope.length + 1);
}
/* UI-07: every update-status reader sees ONLY the current scope's record —
   the same name in the other scope is a different row with different state. */
function scopeUpdates(){ return state.updates[state.scope] || {}; }
function rowSignature(s){
  var upd = scopeUpdates()[s.name] || {};
  return (s.description || '') + '|' + (s.agents || []).join(',') + '|' +
    (s.provenance || 'local') + '|' +
    (upd.updateAvailable ? 'u' : '') + (upd.error ? 'e' : '') +
    (state.checked.has(s.name) ? 'c' : '');
}
function rowHtml(s){
  var outdated = scopeUpdates()[s.name] && scopeUpdates()[s.name].updateAvailable;
  var prov = s.provenance || 'local';
  return '<div class="skill-head"><div class="skill-name">' +
    '<span class="skill-title-unit">' +
    '<input type="checkbox" class="skill-check" aria-label="Select ' + esc(s.name) + ' for update"' +
    (state.checked.has(s.name) ? ' checked' : '') + '>' +
    '<span class="dot' + (s.agents.length ? '' : ' unlinked') + '"></span>' +
    '<span class="skill-name-text">' + esc(s.name) + '</span>' +
    '</span>' +
    (outdated ? '<span class="update-badge">update</span>' : '') +
    '</div>' +
    '<span class="prov-badge prov-' + esc(prov) + '">' + esc(prov) + '</span></div>' +
    '<div class="skill-desc">' + esc(s.description || '') + '</div>' +
    '<div class="chips">' + s.agents.slice(0, 4).map(function(a){
      return '<span class="chip" style="--chip:var(' + chipColor(a) + ')">' + esc(a) + '</span>';
    }).join('') + (s.agents.length > 4 ? '<span class="chip">+' + (s.agents.length - 4) + '</span>' : '') + '</div>';
}
function renderList(){
  var list = $('#skillList');
  var items = filteredSkills();
  var intro = listIntroPending && items.length > 0;
  if (intro) listIntroPending = false;
  var wanted = {};
  items.forEach(function(s){ wanted[rowKeyFor(s.name)] = s; });
  /* pass 1: drop rows the new result set does not contain (and any stray
     non-row nodes) — removal, not display-hiding, so the li count is
     exactly the match set */
  Array.prototype.slice.call(list.children).forEach(function(node){
    var key = node.tagName === 'LI' ? node.getAttribute('data-key') : null;
    if (key !== null && wanted[key]) return;
    if (key !== null) delete rowByKey[key];
    node.remove();
  });
  /* pass 2: create missing rows, refresh changed content in place, keep
     order with the fewest moves */
  var cursor = list.firstChild;
  items.forEach(function(s, i){
    var key = rowKeyFor(s.name);
    var li = rowByKey[key];
    if (!li) {
      li = document.createElement('li');
      li.setAttribute('data-key', key);
      li.style.setProperty('--i', i);
      li.setAttribute('role', 'option');
      li.setAttribute('tabindex', '0');
      if (intro) li.classList.add('rise-in');
      li.__sig = null;
      rowByKey[key] = li;
    }
    var sig = rowSignature(s);
    /* Content is needle-independent — rowHtml builds no match markup and
       rowSignature covers every content source — so a changed needle over
       an identical result set reconciles to zero DOM work. When match
       highlighting ever lands, fold the needle into rowSignature instead
       of re-rendering row content per keystroke. */
    if (li.__sig !== sig) {
      li.innerHTML = rowHtml(s);
      var updError = scopeUpdates()[s.name] && scopeUpdates()[s.name].error;
      // G4: not-checkable/check-failed skills stop being silently badge-less —
      // the status rides the row as a tooltip (the detail pane carries the full line)
      if (updError) li.title = 'update check: ' + updError;
      else if (li.title) li.removeAttribute('title');
      li.__sig = sig;
    }
    var selState = String(s.name === state.selected);
    if (li.getAttribute('aria-selected') !== selState) li.setAttribute('aria-selected', selState);
    if (li === cursor) {
      cursor = li.nextSibling;
    } else {
      /* A moved node restarts CSS animations — strip the entrance class
         before re-inserting so a reorder can never replay the stagger.
         Only ALREADY-CONNECTED rows strip here: brand-new rows must carry
         the class into their insertion (the first-paint cascade). cursor
         is null on a still-empty list, so every first-population row walks
         this branch and must keep the class. */
      if (li.parentNode && li.classList.contains('rise-in')) li.classList.remove('rise-in');
      list.insertBefore(li, cursor);
    }
  });
  if (!items.length) {
    // needle lives in filteredSkills scope — read the filter here instead
    // (0.5.1 hotfix: the old out-of-scope reference threw 'needle is not
    // defined' on every empty render, blanking the list)
    var filterText = (($('#filter').value || '').trim());
    var emptyHtml = filterText ? 'No matches for “' + esc(filterText) + '”' : 'Nothing here yet';
    var empty = list.querySelector('.empty');
    if (!empty) {
      var div = document.createElement('div');
      div.className = 'empty';
      div.innerHTML = emptyHtml;
      div.__sig = emptyHtml;
      list.appendChild(div);
    } else if (empty.__sig !== emptyHtml) {
      empty.innerHTML = emptyHtml;
      empty.__sig = emptyHtml;
    }
  }
  syncSelectAll();
}

function selectSkill(name){
  state.selected = name;
  var selected = state.skills.filter(function(s){ return s.name === name; })[0];
  state.selectedPath = selected ? selected.path : null;
  renderList();
  showDetail(name);
}

/* ---------- markdown detail (S-165) ----------
   Zero-dep renderer for the SKILL.md subset the corpus uses: ATX headings
   (# to ####), flat unordered + ordered lists, fenced code blocks (info
   string echoed as a label), inline code, bold, italic, links, blockquotes,
   horizontal rules, and a cheap GFM table. Escape-FIRST: every text token
   goes through esc() before any tag is built, so the only tags in the
   output are the ones this function emits — no innerHTML of unescaped
   external text anywhere.
   Links never navigate: the ratified CSP posture is no navigation
   (default-src 'none'), so no href attribute is emitted and
   rel="noopener noreferrer" would be moot — the URL stays visible as
   muted text instead.
   Backticks are written as \\u0060 escapes throughout: this whole function
   lives inside the APP_JS template literal, which must stay free of raw
   backtick characters (a raw one would terminate the template). */
function renderMarkdown(md){
  var lines = String(md == null ? '' : md).split(/\\r?\\n/);
  var out = [];
  var para = [];
  function flushPara(){
    if (!para.length) return;
    out.push('<p class="md-p">' + inline(esc(para.join(' '))) + '</p>');
    para = [];
  }
  /* s arrives PRE-ESCAPED — esc() ran before inline() is ever called, so
     every captured group below is already-inert text and the only tags
     added are the renderer's own. */
  var RX_INLINE_FULL = /(\\u0060+(\\u0060?[^\\u0060]+)\\u0060+)|(\\*\\*([^*]+)\\*\\*)|(\\*([^*\\s][^*]*?)\\*)|(\\[([^\\]]+)\\]\\(([^)\\s][^)]*)\\))/g;
  var RX_INLINE_NOLINK = /(\\u0060+(\\u0060?[^\\u0060]+)\\u0060+)|(\\*\\*([^*]+)\\*\\*)|(\\*([^*\\s][^*]*?)\\*)/g;
  function inline(s){
    /* guard (S-165 review): a run of unmatched '[' makes the link
       alternative rescan to end-of-line per start — O(n^2) on
       pathological input. No '](' means no link can ever match, so drop
       the link alternative from the scan (code/bold/em still run). */
    var canLink = s.indexOf('](') >= 0;
    return s.replace(canLink ? RX_INLINE_FULL : RX_INLINE_NOLINK,
      function(m, codeAll, codeBody, boldAll, boldBody, emAll, emBody, linkAll, linkText, linkUrl){
        if (codeAll != null) return '<code class="md-code">' + codeBody + '</code>';
        if (boldAll != null) return '<strong class="md-strong">' + boldBody + '</strong>';
        if (emAll != null) return '<em class="md-em">' + emBody + '</em>';
        /* link branch: no href ever (see block comment) — the URL is shown
           as visible muted text. linkText/linkUrl are re-inlined so bold or
           italic inside them still renders. */
        if (linkAll != null) {
          return '<span class="md-link">' + inline(linkText) + '</span>' +
            '<span class="md-link-url"> (' + inline(linkUrl) + ')</span>';
        }
        return m;
      }
    );
  }
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    /* fenced code block: open fence (info string echoed as a label) */
    var fence = /^\\s{0,3}\\u0060{3,}\\s*([^\\u0060]*?)\\s*$/.exec(line);
    if (fence) {
      flushPara();
      var lang = fence[1];
      var buf = [];
      i++;
      while (i < lines.length && !/^\\s{0,3}\\u0060{3,}\\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++; /* swallow the closing fence (or stop at EOF) */
      out.push(
        '<pre class="md-pre">' +
        (lang ? '<span class="md-lang">' + esc(lang) + '</span>' : '') +
        '<code class="md-codeblock">' + esc(buf.join('\\n')) + '</code></pre>'
      );
      continue;
    }
    /* ATX heading #..#### -> h2..h5 (the pane's h1 is the skill name) */
    var h = /^\\s{0,3}(#{1,4})\\s+(.*?)\\s*#*\\s*$/.exec(line);
    if (h) {
      flushPara();
      var lvl = h[1].length + 1;
      out.push('<h' + lvl + ' class="md-h md-h' + lvl + '">' + inline(esc(h[2])) + '</h' + lvl + '>');
      i++;
      continue;
    }
    /* horizontal rule --- *** ___ */
    if (/^\\s{0,3}((-\\s*){3,}|(\\*\\s*){3,}|(_\\s*){3,})$/.test(line)) {
      flushPara();
      out.push('<hr class="md-hr">');
      i++;
      continue;
    }
    /* blockquote: consecutive > lines flatten into one quote */
    if (/^\\s{0,3}>/.test(line)) {
      flushPara();
      var q = [];
      while (i < lines.length && /^\\s{0,3}>/.test(lines[i])) {
        q.push(lines[i].replace(/^\\s{0,3}>\\s?/, ''));
        i++;
      }
      out.push('<blockquote class="md-quote">' + inline(esc(q.join(' '))) + '</blockquote>');
      continue;
    }
    /* lists: flat (nesting stays a TUI-canonical concern, the corpus is flat) */
    var ul = /^\\s{0,3}[-*+]\\s+(.*)$/.exec(line);
    var ol = /^\\s{0,3}(\\d{1,9})[.)]\\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      var ordered = !!ol;
      var marker = ordered ? /^\\s{0,3}\\d{1,9}[.)]\\s+(.*)$/ : /^\\s{0,3}[-*+]\\s+(.*)$/;
      var cont = /^\\s{0,3}([-*+]|\\d{1,9}[.)])\\s+/;
      var items = [];
      while (i < lines.length) {
        var item = marker.exec(lines[i]);
        if (!item) break;
        items.push(item[1]);
        i++;
        /* lazy continuation: a plain follow-on line joins the open item */
        while (i < lines.length && lines[i].trim() !== '' && !cont.test(lines[i])) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        }
      }
      var tag = ordered ? 'ol' : 'ul';
      var listHtml = '<' + tag + ' class="md-list">';
      for (var j = 0; j < items.length; j++) {
        listHtml += '<li class="md-li">' + inline(esc(items[j])) + '</li>';
      }
      out.push(listHtml + '</' + tag + '>');
      continue;
    }
    /* cheap GFM table: a row containing a pipe over a dashed separator row */
    var sep = /^\\s{0,3}\\|?\\s*:?-{3,}[\\s:|-]*$/;
    if (line.indexOf('|') >= 0 && i + 1 < lines.length && sep.test(lines[i + 1])) {
      flushPara();
      var cells = function(row){
        return row.replace(/^\\s*\\|/, '').replace(/\\|\\s*$/, '').split('|').map(function(c){
          return inline(esc(c.trim()));
        });
      };
      var head = cells(lines[i]);
      i++; /* header row consumed */
      if (i < lines.length && sep.test(lines[i])) i++; /* separator row skipped */
      var tbl = '<table class="md-table"><thead><tr>';
      for (var th = 0; th < head.length; th++) tbl += '<th>' + head[th] + '</th>';
      tbl += '</tr></thead><tbody>';
      while (i < lines.length && lines[i].indexOf('|') >= 0 && !sep.test(lines[i])) {
        var bodyCells = cells(lines[i]);
        tbl += '<tr>';
        for (var td = 0; td < bodyCells.length; td++) tbl += '<td>' + bodyCells[td] + '</td>';
        tbl += '</tr>';
        i++;
      }
      out.push(tbl + '</tbody></table>');
      continue;
    }
    if (line.trim() === '') { flushPara(); i++; continue; }
    para.push(line.trim());
    i++;
  }
  flushPara();
  return out.join('\\n');
}

var detailSeq=0; /* S-204: generation counter — the detail that started last owns the pane */
function showDetail(name){
  /* Bump FIRST (even when no skill matches): superseding a selection — or
     landing on a selection that no longer exists — must orphan any detail
     response already in flight. */
  var seq = ++detailSeq, scope = state.scope;
  if (state.tab !== 'installed') return;
  var skill = state.skills.filter(function(s){ return s.name === name; })[0];
  if (!skill) return;
  var pane = $('#detailPane');
  var upd = scopeUpdates()[skill.name];
  var detailOutdated = upd && upd.updateAvailable;
  var updateError = upd && upd.error ? upd.error : null;
  pane.innerHTML =
    '<h1 class="detail-title">' + esc(skill.name) + '</h1>' +
    '<p class="detail-source">' + esc(skill.source || 'local skill') +
    (detailOutdated ? ' · <span class="update-badge">update available</span>' : '') + '</p>' +
    '<div class="detail-actions">' +
      '<button class="btn danger" id="removeBtn">Remove…</button>' +
      // S-186: Update exists only once a check ran AND this skill has an
      // update available; before that it rendered unconditionally.
      (detailOutdated ? '<button class="btn" id="updateBtn">Update</button>' : '') +
    '</div>' +
    '<dl class="detail-meta">' +
      '<dt>Scope</dt><dd>' + esc(skill.scope) + '</dd>' +
      '<dt>Provenance</dt><dd><span class="prov-badge prov-' + esc(skill.provenance || 'local') + '">' + esc(skill.provenance || 'local') + '</span></dd>' +
      '<dt>Agents</dt><dd>' + (skill.agents.length ? skill.agents.map(esc).join(', ') : 'not linked') + '</dd>' +
      '<dt>Path</dt><dd>' + esc(skill.path) + '</dd>' +
      (updateError ? '<dt>Updates</dt><dd>' + esc(updateError) + '</dd>' : '') +
    '</dl>' +
    '<div class="readme" id="readme">Loading…</div>';
  /* S-204: capture THIS pane's readme node and the row's identity — a late
     response may only paint when it still belongs to the current selection.
     Record the rendered row's path here too: loadSkills re-invokes showDetail
     for a KEPT name whose row (and path) the fresh list may have replaced,
     and selectSkill alone would leave state.selectedPath pointing at the
     old row. */
  var readme = $('#readme'), capturedPath = skill.path;
  state.selectedPath = skill.path;
  function ownsDetail(){
    return seq === detailSeq && state.tab === 'installed' && scope === state.scope &&
      state.selected === skill.name && readme && readme.isConnected &&
      capturedPath === state.selectedPath;
  }
  $('#removeBtn').addEventListener('click', function(){ openRemove(skill); });
  if (detailOutdated) $('#updateBtn').addEventListener('click', function(){ updateSkills([skill.name], skill.scope === 'global'); });
  syncButtons(pane); /* UI-05: detail actions created mid-busy must not miss the busy disable */
  /* S-179: the row's own path rides along — the serve validates it as an exact cached-list row (name stays for older serves). */
  api('/api/skill?scope=' + skill.scope + '&name=' + encodeURIComponent(skill.name) + '&path=' + encodeURIComponent(skill.path))
    .then(function(d){
      if (!ownsDetail()) return;
      /* renderMarkdown escapes every token before any tag is built, so this
         innerHTML carries renderer-made tags around inert text only */
      readme.innerHTML = renderMarkdown(d.body || '(empty SKILL.md)');
    })
    .catch(function(){
      if (!ownsDetail()) return;
      readme.innerHTML = renderMarkdown('(SKILL.md unavailable)');
    });
}

function nonLockedWarning(skillsList){
  var risky = (skillsList || []).filter(function(s){
    return s && (s.provenance === 'linked' || s.provenance === 'local');
  });
  if (!risky.length) return '';
  return ' Warning: non-locked skills (' +
    risky.map(function(s){ return s.name + ' [' + (s.provenance || 'local') + ']'; }).join(', ') +
    ') are symlinked or locally managed.';
}

function deleteChecked(){
  var names = Array.from(state.checked);
  if (!names.length) return;
  var targets = state.skills.filter(function(s){ return state.checked.has(s.name); });
  var dlg = $('#confirmDialog');
  $('#confirmText').textContent =
    'Remove ' + names.length + ' skill' + (names.length === 1 ? '' : 's') +
    ' (' + names.join(', ') + ') from ' + state.scope + ' scope?' + nonLockedWarning(targets);
  dlg.showModal();
  $('#confirmYes').onclick = function(){
    dlg.close();
    setBusy('Removing ' + names.length + ' skill' + (names.length === 1 ? '' : 's') + '…');
    api('/api/remove', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ skills: names, global: state.scope === 'global' }) })
      .then(function(res){
        if (!res.ok) {
          // /api/remove answers HTTP 200 + ok:false when names survive the
          // list-diff; the body's output names the failures (G2/ST3).
          play('error');
          toast(clip(res.output, 240) || 'Remove failed', 'error');
          handlePostMutation(res);
          return loadSkills();
        }
        play('success');
        toast('Removed ' + names.length + ' skill' + (names.length === 1 ? '' : 's'), 'success');
        handlePostMutation(res);
        state.checked.clear();
        renderSelSummary();
        state.selected = null;
        state.selectedPath = null;
        return loadSkills();
      })
      .catch(function(e){ play('error'); toast(e.message, 'error'); })
      .finally(function(){ setBusy(null); });
  };
}

function openRemove(skill){
  var dlg = $('#confirmDialog');
  $('#confirmText').textContent = 'Remove “' + skill.name + '” from ' + skill.scope + ' scope? Agent links will be cleaned up.' + nonLockedWarning([skill]);
  dlg.showModal();
  $('#confirmYes').onclick = function(){
    dlg.close();
    setBusy('Removing ' + skill.name + '…');
    api('/api/remove', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ skills:[skill.name], global: skill.scope === 'global' }) })
      .then(function(res){
        if (!res.ok) {
          play('error');
          toast(clip(res.output, 240) || ('Remove failed for ' + skill.name), 'error');
          handlePostMutation(res);
          return loadSkills();
        }
        play('success'); toast('Removed ' + skill.name, 'success'); handlePostMutation(res); state.selected = null; state.selectedPath = null; return loadSkills();
      })
      .catch(function(e){ play('error'); toast(e.message, 'error'); })
      .finally(function(){ setBusy(null); });
  };
}

function applySeed(){
  var seed = window.__SEED__ || { kind: 'none' };
  if (seed.kind === 'add' && seed.source) showInstallSeed(seed);
  else if (seed.kind === 'update' && seed.skills && seed.skills.length) {
    // S-187 parity (review F1): intersect the seed names with the real
    // installed list — same G5 discipline as the remove seed below. The
    // TUI prunes model.checked on every skills-loaded (model.ts), so an
    // unfiltered web set diverged on stale/externally-removed names.
    loadSkills().then(function(){
      var found = [], notInstalled = [];
      seed.skills.forEach(function(n){
        if (state.skills.some(function(s){ return s.name === n; })) found.push(n);
        else notInstalled.push(n);
      });
      state.checked = new Set(found);
      renderList(); renderSelSummary();
      var msg = found.length + ' skill' + (found.length === 1 ? '' : 's') + ' selected for update';
      if (notInstalled.length) {
        play('error');
        toast(msg + ' (not installed: ' + notInstalled.join(', ') + ')', 'error');
      } else {
        toast(msg, 'success');
      }
    });
  } else if (seed.kind === 'remove' && seed.skills && seed.skills.length) {
    // G5: pre-check the seed names against the real installed list — the old
    // branch success-toasted and dead-ended. The checked set feeds the remove
    // bar, so the user lands one click from the destructive action, same as
    // the update seed above.
    loadSkills().then(function(){
      var found = [], notInstalled = [];
      seed.skills.forEach(function(n){
        if (state.skills.some(function(s){ return s.name === n; })) found.push(n);
        else notInstalled.push(n);
      });
      state.checked = new Set(found);
      renderList(); renderSelSummary();
      var msg = found.length + ' skill' + (found.length === 1 ? '' : 's') + ' selected for removal';
      if (notInstalled.length) {
        play('error');
        toast(msg + ' (not installed: ' + notInstalled.join(', ') + ')', 'error');
      } else {
        toast(msg, 'success');
      }
    });
  }
}

function showInstallSeed(seed){
  state.seedHold = true;
  detailSeq++; /* S-204: the seed pane replaces any detail still in flight */
  var pane = $('#detailPane');
  pane.innerHTML =
    '<h1 class="detail-title">Install from ' + esc(seed.source) + '</h1>' +
    '<p class="detail-source" id="seedStatus">Loading skill list…</p>' +
    '<div id="seedList" class="seed-list"></div>' +
    '<div class="detail-actions" style="margin-top:16px">' +
      '<button class="btn primary" id="seedInstall">Install selected</button>' +
      '<button class="btn" id="seedInstallAll">Install all</button>' +
      '<button class="btn" id="seedCancel">Cancel</button>' +
    '</div>';
  syncButtons(pane); /* UI-05: seed actions created mid-busy must not miss the busy disable */
  var closeSeed = function(){ state.seedHold = false; loadSkills(); };
  $('#seedCancel').addEventListener('click', closeSeed);
  var preSelected = seed.skills || [];
  api('/api/source-skills?source=' + encodeURIComponent(seed.source))
    .then(function(d){
      if (state.seedHold === false) return;
      var names = d.skills.map(function(x){ return x.name; });
      if (!names.length) { $('#seedStatus').textContent = 'No skills found in this source.'; return; }
      var chosen = new Set(preSelected.length ? names.filter(function(n){ return preSelected.indexOf(n) >= 0; }) : names);
      if (!chosen.size) chosen = new Set(names);
      $('#seedStatus').textContent = names.length + ' skills available, pick what to install:';
      var box = $('#seedList');
      box.innerHTML = '';
      names.forEach(function(n){
        var row = document.createElement('label');
        row.className = 'seed-row';
        row.innerHTML = '<input type="checkbox" data-skill="' + esc(n) + '"' +
          (chosen.has(n) ? ' checked' : '') + '> <span>' + esc(n) + '</span>';
        box.appendChild(row);
      });
      $('#seedInstall').addEventListener('click', function(){
        var picked = Array.prototype.map.call(box.querySelectorAll('input:checked'), function(i){ return i.getAttribute('data-skill'); });
        if (!picked.length) { play('error'); toast('Select at least one skill', 'error'); return; }
        runSeedInstall(seed.source, picked);
      });
      $('#seedInstallAll').addEventListener('click', function(){ runSeedInstall(seed.source, ['*']); });
    })
    .catch(function(e){ $('#seedStatus').textContent = 'Could not list skills: ' + e.message; });
}

function runSeedInstall(source, skills){
  setBusy('Installing from ' + source + '…');
  api('/api/install', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ source: source, skills: skills, global: state.scope === 'global' }) })
    .then(function(res){
      if (res.ok) { play('success'); toast('Installed from ' + source, 'success'); }
      else { play('error'); toast('Install failed for some skills', 'error'); }
      handlePostMutation(res);
      state.seedHold = false;
      return loadSkills();
    })
    .catch(function(e){ play('error'); toast(e.message, 'error'); })
    .finally(function(){ setBusy(null); });
}

function updateSkills(skills, global){
  var all = !skills || !skills.length;
  setBusy(all ? 'Updating all skills…' : 'Updating ' + skills.join(', ') + '…');
  api('/api/update', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ skills: skills, global: global }) })
    .then(function(res){
      if (!res.ok) {
        // /api/update answers HTTP 200 + ok:false when the CLI exits non-zero;
        // surface the sanitized output instead of a success-tone lie (G2/ST3).
        play('error');
        toast(clip(res.output, 240) || 'Update failed', 'error');
        handlePostMutation(res);
        if (state.tab === 'search') refreshInstalledAll().then(renderResults);
        return loadSkills();
      }
      play('success');
      toast(all ? 'Update finished' : 'Updated ' + skills.join(', '), 'success');
      handlePostMutation(res);
      state.checked.clear();
      renderSelSummary();
      if (state.tab === 'search') refreshInstalledAll().then(renderResults);
      return loadSkills();
    })
    .catch(function(e){ play('error'); toast(e.message, 'error'); })
    .finally(function(){ setBusy(null); });
}

function checkForUpdates(force){
  var scope = state.scope;
  if (!force && state.updateCheckDone[scope]) return Promise.resolve();
  /* UI-07: the token is captured (and bumped) per scope at dispatch — only
     the LATEST request for that scope may store, and a response that lands
     after the view moved on may only fill its own scope's cache. */
  var seq = ++state.updateCheckSeq[scope];
  return api('/api/updates?scope=' + scope)
    .then(function(d){
      if (seq !== state.updateCheckSeq[scope]) return; // a newer check for this scope owns the record
      state.updates[scope] = d.updates || {};
      state.updateCheckDone[scope] = true;
      if (state.scope !== scope) return; // cache without visible effects
      var updates = state.updates[scope];
      var n = Object.keys(updates).filter(function(k){ return updates[k].updateAvailable; }).length;
      renderList();
      if (state.tab === 'installed' && state.selected) showDetail(state.selected);
      if (state.tab === 'search') {
        renderResults();
        if (state.selectedSearchKey) showSearchDetail(selectedSearchResult());
      }
      if (n > 0) toast(n + ' update' + (n === 1 ? '' : 's') + ' available', 'success');
      else if (force) toast('no updates available', 'success');
    })
    .catch(function(e){
      // ST4: the silent no-op catch hid check failures (and left the manual
      // button dead after the once-per-scope auto-check) — say so instead.
      // UI-07: but only for the CURRENT owner — a stale or post-switch
      // failure says nothing about the view now on screen.
      if (seq !== state.updateCheckSeq[scope] || state.scope !== scope) return;
      play('error');
      toast('update check failed: ' + (e && e.message ? e.message : String(e)), 'error');
    });
}

`;
}
