import {test,expect} from '@playwright/test';
import {startAuditBackend,openAuditPage,row,settleResponse,closeAuditPages} from './helpers/audit-fixture.ts';
import {deferred} from '../helpers/audit-state.ts';
let backend:Awaited<ReturnType<typeof startAuditBackend>>;
let origin:string;
test.beforeAll(async()=>{backend=await startAuditBackend();origin=backend.origin;});
test.afterEach(async()=>{await closeAuditPages();});
test.afterAll(async()=>{await backend?.stop();});

test('browser install list keeps project scope while global is selected',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const first=deferred<void>(),started=deferred<void>(),calls:boolean[]=[];
  await page.route('**/api/install',async route=>{
    const body=route.request().postDataJSON();calls.push(body.global);
    if(calls.length===1){started.resolve();await first.promise;}
    await route.fulfill({json:{ok:true,output:'fixture installed'}});
  });
  try{
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('new');
    await page.locator('#results .add-btn').nth(0).click();
    await page.locator('#results .add-btn').nth(1).click();
    await page.locator('#installQueueBtn').click();await started.promise;
    await page.locator('[data-scope="global"]').click();first.resolve();
    await expect.poll(()=>calls.length).toBe(2);expect(calls).toEqual([false,false]);
    expect(pageErrors).toEqual([]);
  }finally{first.resolve();await context.close();}
});

// S-202 symmetry: the mirrored direction — start global, switch to project
// mid-batch; every body must still carry the captured start-of-batch scope.
test('browser install list keeps global scope while project is selected',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const first=deferred<void>(),started=deferred<void>(),calls:boolean[]=[];
  await page.route('**/api/install',async route=>{
    const body=route.request().postDataJSON();calls.push(body.global);
    if(calls.length===1){started.resolve();await first.promise;}
    await route.fulfill({json:{ok:true,output:'fixture installed'}});
  });
  try{
    await page.locator('[data-scope="global"]').click(); // start the batch in global scope
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('new');
    await page.locator('#results .add-btn').nth(0).click();
    await page.locator('#results .add-btn').nth(1).click();
    await page.locator('#installQueueBtn').click();await started.promise;
    await page.locator('[data-scope="project"]').click(); // scope → project mid-batch
    first.resolve();
    await expect.poll(()=>calls.length).toBe(2); // never infer completion before the second request arrives
    expect(calls).toEqual([true,true]); // BOTH bodies carry the captured global scope
    expect(pageErrors).toEqual([]);
  }finally{first.resolve();await context.close();}
});

// S-202 partial failure: a failed first group must not abort the batch, and
// the retained summary toast must stay honest about both outcomes.
test('browser install list retains partial-failure output',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const calls:boolean[]=[];
  await page.route('**/api/install',async route=>{
    const body=route.request().postDataJSON();calls.push(body.global);
    const ok=calls.length===2; // only the second group succeeds
    await route.fulfill({json:{ok,output:ok?'fixture installed':'boom'}});
  });
  try{
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('new');
    await page.locator('#results .add-btn').nth(0).click();
    await page.locator('#results .add-btn').nth(1).click();
    await page.locator('#installQueueBtn').click();
    await expect.poll(()=>calls.length).toBe(2); // the failed first group must not abort the batch
    expect(calls).toEqual([false,false]);
    await expect(page.locator('.toast', { hasText: 'Installed 1, failed 1' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  }finally{await context.close();}
});

// S-199: seed discovery → the real "Install all" button must post exactly
// the singleton wildcard skills:["*"] (the API alone exempts it from the
// shared name charset and maps it to `add … --all`). The install response is
// stubbed like every case above; the captured body and the success toast are
// the pins here, while the 200 + ok:true acceptance lives at the API seam.
test('browser seed install all sends the singleton wildcard',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const bodies:Array<Record<string, unknown>>=[];
  await page.route('**/api/install',async route=>{
    bodies.push(route.request().postDataJSON());
    await route.fulfill({json:{ok:true,output:'fixture installed'}});
  });
  // The audit backend serves the plain page (no CLI seed); pin an add-seed
  // through the bootstrap embed assignment — an init script runs before the
  // document scripts (and outside the hash-pinned CSP), so a one-way setter
  // guard keeps the real seed pane + real Install all button in charge.
  await page.addInitScript(()=>{
    const seed={kind:'add',source:'fixture/repo',skills:['alpha']};
    Object.defineProperty(window,'__SEED__',{configurable:true,get:()=>seed,set:()=>{}});
  });
  try{
    await page.goto(origin); // reload with the seed active
    // seed discovery runs against the REAL backend + CLI shim (the fixture
    // stubs no /api/source-skills route): wait for the parsed rows
    await expect(page.locator('#seedList .seed-row')).toHaveCount(3);
    await page.locator('#seedInstallAll').click();
    await expect.poll(()=>bodies.length).toBe(1);
    expect(bodies[0]).toEqual({source:'fixture/repo',skills:['*'],global:false});
    await expect(page.locator('.toast', { hasText: 'Installed from fixture/repo' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  }finally{await context.close();}
});

// S-205 (UI-04): a held /api/skills response for the OLD scope must never
// replace the rows of the NEWLY selected scope — the load that started last
// owns the list until superseded.
test('late global rows cannot replace newer project rows', async ({ browser }) => {
  const { page, context } = await openAuditPage(browser, origin);
  const gate = deferred<void>(), started = deferred<void>();
  await page.route('**/api/skills?scope=global', async route => {
    started.resolve(); await gate.promise;
    await route.fulfill({ json: { scope: 'global', skills: [row('global-only', 'global')] } });
  });
  await page.locator('[data-scope="global"]').click(); await started.promise;
  await page.locator('[data-scope="project"]').click();
  await expect(page.locator('#skillList')).toContainText('alpha');
  const response = page.waitForResponse('**/api/skills?scope=global');
  gate.resolve(); await settleResponse(page, await response);
  await expect(page.locator('#skillList')).not.toContainText('global-only');
  await expect(page.locator('#skillList')).toContainText('alpha');
  await context.close();
});

// S-205 sequencing, same scope: two reloads of ONE scope where the earlier
// response lands after the later one — the latest load must stay in charge.
test('late same-scope rows cannot replace a newer reload',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const firstGate=deferred<void>(),firstStarted=deferred<void>(),secondStarted=deferred<void>();
  let calls=0;
  await page.route('**/api/skills?scope=project',async route=>{
    calls++;
    if(calls===1){firstStarted.resolve();await firstGate.promise;
      await route.fulfill({json:{scope:'project',skills:[row('stale-one','project'),row('stale-two','project')]}});}
    else{secondStarted.resolve();
      await route.fulfill({json:{scope:'project',skills:[row('alpha','project'),row('beta','project'),row('fresh','project')]}});}
  });
  try{
    await page.locator('[data-scope="project"]').click();await firstStarted.promise;
    const second=page.waitForResponse('**/api/skills?scope=project');
    await page.locator('[data-scope="project"]').click();await secondStarted.promise;
    await settleResponse(page,await second);
    await expect(page.locator('#skillList')).toContainText('fresh');
    const stale=page.waitForResponse('**/api/skills?scope=project');
    firstGate.resolve();await settleResponse(page,await stale);
    await expect(page.locator('#skillList')).not.toContainText('stale-one');
    await expect(page.locator('#skillList')).toContainText('alpha');
    await expect(page.locator('#skillList')).toContainText('fresh');
    expect(pageErrors).toEqual([]);
  }finally{firstGate.resolve();await context.close();}
});

// S-205 empty lists: an empty scope renders the honest empty state and
// switching back restores the rows without leaking the stale selection.
test('empty scope renders the empty state and recovers on switch back',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  await page.route('**/api/skills?scope=global',route=>route.fulfill({json:{scope:'global',skills:[]}}));
  try{
    await page.locator('[data-scope="global"]').click();
    await expect(page.locator('#detailPane')).toContainText('No global skills installed');
    const back=page.waitForResponse('**/api/skills?scope=project');
    await page.locator('[data-scope="project"]').click();
    await settleResponse(page,await back);
    await expect(page.locator('#detailPane')).not.toContainText('No global skills installed');
    await expect(page.locator('#skillList')).toContainText('alpha');
    expect(pageErrors).toEqual([]);
  }finally{await context.close();}
});

// S-204 (UI-03): a held /api/skill response for a PREVIOUSLY selected row
// must never paint its body under the NEWLY selected row's title — the
// detail that started last owns the pane until superseded.
test('late beta detail cannot replace selected alpha', async ({ browser }) => {
  const { page, context } = await openAuditPage(browser, origin);
  const gate = deferred<void>(), started = deferred<void>();
  await page.route('**/api/skill?*', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('name') !== 'beta') return route.fallback();
    started.resolve(); await gate.promise;
    await route.fulfill({ json: { body: 'STALE_BETA' } });
  });
  await page.locator('#skillList li', { hasText: 'beta' }).click(); await started.promise;
  await page.locator('#skillList li', { hasText: 'alpha' }).click();
  await expect(page.locator('#readme')).toContainText('BODY_alpha');
  const response = page.waitForResponse(r => r.url().includes('/api/skill?') && r.url().includes('beta'));
  gate.resolve(); await settleResponse(page, await response);
  await expect(page.locator('.detail-title')).toHaveText('alpha');
  await expect(page.locator('#readme')).toContainText('BODY_alpha');
  await context.close();
});

// S-204 stale FAILURE: a held /api/skill response that fails for a
// previously selected row must not paint '(SKILL.md unavailable)' into the
// NEWLY selected row's readme either — the guard covers the error path.
test('failed stale detail cannot replace selected alpha', async ({ browser }) => {
  const { page, context, pageErrors } = await openAuditPage(browser, origin);
  const gate = deferred<void>(), started = deferred<void>();
  await page.route('**/api/skill?*', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('name') !== 'beta') return route.fallback();
    started.resolve(); await gate.promise;
    await route.fulfill({ status: 500, json: { error: 'boom' } });
  });
  try{
    await page.locator('#skillList li', { hasText: 'beta' }).click(); await started.promise;
    await page.locator('#skillList li', { hasText: 'alpha' }).click();
    await expect(page.locator('#readme')).toContainText('BODY_alpha');
    const response = page.waitForResponse(r => r.url().includes('/api/skill?') && r.url().includes('beta'));
    gate.resolve(); await settleResponse(page, await response);
    await expect(page.locator('.detail-title')).toHaveText('alpha');
    await expect(page.locator('#readme')).toContainText('BODY_alpha');
    await expect(page.locator('#readme')).not.toContainText('unavailable');
    expect(pageErrors).toEqual([]);
  }finally{gate.resolve();await context.close();}
});

// S-204 scope invalidation: a held detail for the old scope must not paint
// after the scope switched — the pane then belongs to the new scope's row
// (here the kept name 'beta' re-resolves to the global row with its body).
test('stale detail cannot paint after a scope switch', async ({ browser }) => {
  const { page, context, pageErrors } = await openAuditPage(browser, origin);
  const gate = deferred<void>(), started = deferred<void>();
  await page.route('**/api/skill?*', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('name') !== 'beta' || u.searchParams.get('scope') !== 'project') return route.fallback();
    started.resolve(); await gate.promise;
    await route.fulfill({ json: { body: 'STALE_BETA' } });
  });
  try{
    await page.locator('#skillList li', { hasText: 'beta' }).click(); await started.promise;
    await page.locator('[data-scope="global"]').click();
    await expect(page.locator('.detail-title')).toHaveText('beta');
    await expect(page.locator('#readme')).toContainText('BODY_beta');
    const response = page.waitForResponse(r => r.url().includes('/api/skill?') &&
      r.url().includes('name=beta') && r.url().includes('scope=project'));
    gate.resolve(); await settleResponse(page, await response);
    await expect(page.locator('.detail-title')).toHaveText('beta');
    await expect(page.locator('#readme')).toContainText('BODY_beta');
    await expect(page.locator('#readme')).not.toContainText('STALE_BETA');
    await expect(page.locator('.detail-meta')).toContainText('/fixture/global/beta');
    await expect(page.locator('.detail-meta')).not.toContainText('/fixture/project/beta');
    expect(pageErrors).toEqual([]);
  }finally{gate.resolve();await context.close();}
});

// S-204 empty-pane invalidation: a held detail must not resurrect a readme
// inside the empty state the newer scope load just rendered.
test('stale detail cannot paint into the empty pane', async ({ browser }) => {
  const { page, context, pageErrors } = await openAuditPage(browser, origin);
  const gate = deferred<void>(), started = deferred<void>();
  await page.route('**/api/skills?scope=global', route => route.fulfill({ json: { scope: 'global', skills: [] } }));
  await page.route('**/api/skill?*', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('name') !== 'beta') return route.fallback();
    started.resolve(); await gate.promise;
    await route.fulfill({ json: { body: 'STALE_BETA' } });
  });
  try{
    await page.locator('#skillList li', { hasText: 'beta' }).click(); await started.promise;
    await page.locator('[data-scope="global"]').click();
    await expect(page.locator('#detailPane')).toContainText('No global skills installed');
    const response = page.waitForResponse(r => r.url().includes('/api/skill?') && r.url().includes('beta'));
    gate.resolve(); await settleResponse(page, await response);
    await expect(page.locator('#detailPane')).toContainText('No global skills installed');
    await expect(page.locator('#detailPane')).not.toContainText('STALE_BETA');
    await expect(page.locator('#readme')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  }finally{gate.resolve();await context.close();}
});

// S-204 identity: the same NAME in both scopes is still two different rows —
// the late project-alpha response carries the OLD path, the pane now belongs
// to the global-alpha row, so name equality alone must not let it paint.
test('late same-name detail cannot replace a distinct-path selection', async ({ browser }) => {
  const { page, context, pageErrors } = await openAuditPage(browser, origin);
  const gate = deferred<void>(), started = deferred<void>();
  await page.route('**/api/skill?*', async route => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('path') !== '/fixture/project/alpha') return route.fallback();
    started.resolve(); await gate.promise;
    await route.fulfill({ json: { body: 'STALE_PROJECT_ALPHA' } });
  });
  try{
    await page.locator('#skillList li', { hasText: 'alpha' }).click(); await started.promise;
    await page.locator('[data-scope="global"]').click();
    await expect(page.locator('#readme')).toContainText('BODY_alpha');
    const response = page.waitForResponse(r => r.url().includes('/api/skill?') &&
      r.url().includes('name=alpha') && r.url().includes('scope=project'));
    gate.resolve(); await settleResponse(page, await response);
    await expect(page.locator('.detail-title')).toHaveText('alpha');
    await expect(page.locator('#readme')).toContainText('BODY_alpha');
    await expect(page.locator('#readme')).not.toContainText('STALE_PROJECT_ALPHA');
    await expect(page.locator('.detail-meta')).toContainText('/fixture/global/alpha');
    await expect(page.locator('.detail-meta')).not.toContainText('/fixture/project/alpha');
    expect(pageErrors).toEqual([]);
  }finally{gate.resolve();await context.close();}
});

// UI-07 (S-208): update-check results are scope-keyed — a project badge must
// never survive onto a same-name global row.
test('project update status never leaks into a global row',async({browser})=>{
  const {page,context}=await openAuditPage(browser,origin);
  await page.route('**/api/updates?scope=project',route=>route.fulfill({json:{
    scope:'project',updates:{alpha:{name:'alpha',sourceType:'github',updateAvailable:true}},checkedCount:1
  }}));
  await page.locator('#checkUpdatesBtn').click();
  await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toBeVisible();
  const switched=page.waitForResponse('**/api/skills?scope=global');
  await page.locator('[data-scope="global"]').click();await settleResponse(page,await switched);
  await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
  await context.close();
});

// UI-07 reverse order + retention: a global check's badge must not paint on
// the project row, and each scope's cached status must survive the round trip.
test('global update status stays scoped and survives a round trip',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  await page.route('**/api/updates?scope=global',route=>route.fulfill({json:{
    scope:'global',updates:{alpha:{name:'alpha',sourceType:'github',updateAvailable:true}},checkedCount:1
  }}));
  try{
    const toGlobal=page.waitForResponse('**/api/skills?scope=global');
    await page.locator('[data-scope="global"]').click();
    await settleResponse(page,await toGlobal);
    await page.locator('#checkUpdatesBtn').click();
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toBeVisible();
    const toProject=page.waitForResponse('**/api/skills?scope=project');
    await page.locator('[data-scope="project"]').click();await settleResponse(page,await toProject);
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
    const backToGlobal=page.waitForResponse('**/api/skills?scope=global');
    await page.locator('[data-scope="global"]').click();await settleResponse(page,await backToGlobal);
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toBeVisible();
    expect(pageErrors).toEqual([]);
  }finally{await context.close();}
});

// UI-07 late FAILURE: a held project check that fails after the scope switch
// must not toast over the global view (nothing to cache — no visible effect).
test('a late failed update check cannot toast over the switched scope',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const gate=deferred<void>(),started=deferred<void>();
  await page.route('**/api/updates?scope=project',async route=>{
    started.resolve();await gate.promise;
    await route.fulfill({status:500,json:{error:'boom'}});
  });
  try{
    await page.locator('#checkUpdatesBtn').click();await started.promise;
    const switched=page.waitForResponse('**/api/skills?scope=global');
    await page.locator('[data-scope="global"]').click();await settleResponse(page,await switched);
    const stale=page.waitForResponse('**/api/updates?scope=project');
    gate.resolve();await settleResponse(page,await stale);
    // short window: the toast self-removes after 3.9s, well inside the default
    // 5s retry — the bound keeps the absence assertion from passing vacuously
    await expect(page.locator('.toast',{hasText:'update check failed'})).toHaveCount(0,{timeout:500});
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  }finally{gate.resolve();await context.close();}
});

// UI-07 newer same-scope check: two overlapping checks for ONE scope — the
// earlier result settling after the newer one must be dropped entirely.
test('a newer same-scope update check rejects the stale earlier result',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const firstGate=deferred<void>(),firstStarted=deferred<void>(),secondStarted=deferred<void>();
  let calls=0;
  await page.route('**/api/updates?scope=project',async route=>{
    calls++;
    if(calls===1){firstStarted.resolve();await firstGate.promise;
      await route.fulfill({json:{scope:'project',updates:{alpha:{name:'alpha',sourceType:'github',updateAvailable:true}},checkedCount:1}});}
    else{secondStarted.resolve();
      await route.fulfill({json:{scope:'project',updates:{},checkedCount:1}});}
  });
  try{
    await page.locator('#checkUpdatesBtn').click();await firstStarted.promise;
    const second=page.waitForResponse('**/api/updates?scope=project');
    await page.locator('#checkUpdatesBtn').click();await secondStarted.promise;
    await settleResponse(page,await second);
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
    const stale=page.waitForResponse('**/api/updates?scope=project');
    firstGate.resolve();await settleResponse(page,await stale);
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  }finally{firstGate.resolve();await context.close();}
});

// UI-07 honest current-scope failure: a manual global check that fails still
// reports in the global view, while the project badge stays out of global rows.
test('a global check failure reports honestly while project status stays scoped',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  await page.route('**/api/updates?scope=project',route=>route.fulfill({json:{
    scope:'project',updates:{alpha:{name:'alpha',sourceType:'github',updateAvailable:true}},checkedCount:1
  }}));
  await page.route('**/api/updates?scope=global',route=>route.fulfill({status:500,json:{error:'boom'}}));
  try{
    await page.locator('#checkUpdatesBtn').click();
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toBeVisible();
    const switched=page.waitForResponse('**/api/skills?scope=global');
    await page.locator('[data-scope="global"]').click();await settleResponse(page,await switched);
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
    await page.locator('#checkUpdatesBtn').click();
    await expect(page.locator('.toast',{hasText:'update check failed'})).toBeVisible();
    await expect(page.locator('#skillList li',{hasText:'alpha'}).locator('.update-badge')).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  }finally{await context.close();}
});

// UI-05 (S-206): a busy reset must not re-enable a semantically disabled
// control — the "Installed" result button keeps its reason through the held
// update work, and results re-created mid-flight must inherit the busy state
// too (one writer owns disabled: busy OR semantic marker).
test('Installed stays disabled after held update work finishes',async({browser})=>{
  const {page,context}=await openAuditPage(browser,origin);
  const hold=deferred<void>(),started=deferred<void>();
  await page.route('**/api/search?*',route=>route.fulfill({json:{results:[
    {name:'alpha',slug:'alpha',source:'fixture/repo',installs:1}
  ],adjustedQuery:null}}));
  await page.route('**/api/update',async route=>{
    started.resolve();await hold.promise;await route.fulfill({json:{ok:true,output:'updated fixture'}});
  });
  await page.locator('[data-tab="search"]').click();
  await page.locator('#searchInput').fill('alpha');
  const installed=page.locator('#results .install-btn').filter({hasText:'Installed'});
  await expect(installed).toBeDisabled();
  await page.locator('[data-tab="installed"]').click();
  await page.locator('#updateAllBtn').click();await started.promise;
  await page.locator('[data-tab="search"]').click();await expect(installed).toBeDisabled();
  const refreshed=page.waitForResponse('**/api/skills?scope=project');
  hold.resolve();await settleResponse(page,await refreshed);
  await expect(installed).toBeDisabled();
  await context.close();
});

// UI-05 (S-206): the in-list reason is independent of busy — a busy reset
// must keep the queued row's button disabled while an eligible button
// returns to usable, including for results re-created mid-flight.
test('in-list reason survives busy end and eligible buttons recover',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const updateHold=deferred<void>(),updateStarted=deferred<void>();
  const listHold=deferred<void>(),listStarted=deferred<void>();
  let skillCalls=0;
  // project-skill call plan after openAuditPage: #1 the search tab's
  // refreshInstalledAll, #2 the installed tab's loadSkills (HELD — keeps the
  // update busy alive while results are re-created), #3 its refresh again,
  // #4 the held update's own completion load.
  await page.route('**/api/skills?scope=project',async route=>{
    skillCalls++;
    if(skillCalls===2){listStarted.resolve();await listHold.promise;}
    await route.fulfill({json:{scope:'project',skills:[row('alpha','project'),row('beta','project')]}});
  });
  await page.route('**/api/update',async route=>{
    updateStarted.resolve();await updateHold.promise;
    await route.fulfill({json:{ok:true,output:'updated fixture'}});
  });
  try{
    await page.locator('[data-tab="search"]').click();
    await page.locator('#searchInput').fill('new');
    const adds=page.locator('#results .add-btn');
    await expect(adds).toHaveCount(2);
    await adds.nth(0).click();
    const inList=page.locator('#results .add-btn',{hasText:'In list'});
    const eligible=page.locator('#results .install-btn').nth(1);
    await expect(inList).toBeDisabled();
    await expect(eligible).toBeEnabled();
    await page.locator('#updateAllBtn').click();await updateStarted.promise;
    await page.locator('[data-tab="installed"]').click();await listStarted.promise;
    await page.locator('[data-tab="search"]').click(); // results re-created mid-flight
    await expect(inList).toBeDisabled(); // fresh nodes: busy AND the marker hold
    await expect(eligible).toBeDisabled(); // busy alone holds the eligible row
    const refreshed=page.waitForResponse('**/api/skills?scope=project');
    updateHold.resolve();listHold.resolve();
    await settleResponse(page,await refreshed);
    await expect(inList).toBeDisabled(); // the semantic reason outlives busy
    await expect(eligible).toBeEnabled(); // busy alone never persists
    expect(pageErrors).toEqual([]);
  }finally{updateHold.resolve();listHold.resolve();await context.close();}
});

// UI-05 (S-206): a detail pane opened mid-flight creates its action buttons
// DURING busy — the writer must hold them, then release them with busy.
test('detail actions created during busy hold and recover with it',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const hold=deferred<void>(),started=deferred<void>();
  await page.route('**/api/update',async route=>{
    started.resolve();await hold.promise;await route.fulfill({json:{ok:true,output:'updated fixture'}});
  });
  try{
    await page.locator('#updateAllBtn').click();await started.promise;
    await page.locator('#skillList li',{hasText:'beta'}).click();
    await expect(page.locator('.detail-title')).toHaveText('beta');
    const remove=page.locator('#removeBtn');
    await expect(remove).toBeDisabled(); // created mid-busy: held by the writer
    const refreshed=page.waitForResponse('**/api/skills?scope=project');
    hold.resolve();await settleResponse(page,await refreshed);
    await expect(remove).toBeEnabled(); // and released exactly with busy
    expect(pageErrors).toEqual([]);
  }finally{hold.resolve();await context.close();}
});

// UI-05 (S-206): the connection probe holds the Connect button for an
// independent reason — an unrelated busy transition ending mid-probe must
// not re-enable it, the probe end must not override a still-busy page, and
// seed actions created during the post-probe boot busy inherit the hold.
test('connect probe reason survives busy end and seed actions inherit busy',async({browser})=>{
  const {page,context,pageErrors}=await openAuditPage(browser,origin);
  const probeHold=deferred<void>(),probeStarted=deferred<void>();
  const updateHold=deferred<void>(),updateStarted=deferred<void>();
  const bootHold=deferred<void>(),bootStarted=deferred<void>();
  let skillCalls=0;
  // project-skill call plan after the seeded reload: #1 the reload's own
  // load, #2 the held update's completion load, #3 the post-probe boot load
  // (HELD — the seed pane is re-created during it).
  await page.route('**/api/skills?scope=project',async route=>{
    skillCalls++;
    if(skillCalls===3){bootStarted.resolve();await bootHold.promise;} // the boot load after probe success
    await route.fulfill({json:{scope:'project',skills:[row('alpha','project'),row('beta','project')]}});
  });
  await page.route('**/api/version',async route=>{
    probeStarted.resolve();await probeHold.promise;
    await route.fulfill({json:{version:'0.0.0-fixture',capabilities:{hosted:true}}});
  });
  await page.route('**/api/prefs',route=>route.fulfill({json:{ok:true}}));
  await page.route('**/api/update',async route=>{
    updateStarted.resolve();await updateHold.promise;
    await route.fulfill({json:{ok:true,output:'updated fixture'}});
  });
  await page.addInitScript(()=>{
    const seed={kind:'add',source:'fixture/repo',skills:['alpha']};
    Object.defineProperty(window,'__SEED__',{configurable:true,get:()=>seed,set:()=>{}});
  });
  try{
    await page.goto(origin); // the init script only reaches future navigations
    await expect(page.locator('#skillList')).toContainText('alpha');
    await page.evaluate(()=>document.getElementById('connectState').click()); // opener is display:none off-loopback
    await page.locator('#backendInput').fill(origin);
    await page.locator('#tokenInput').fill('fixture-token');
    await page.locator('#connectBtn').click();await probeStarted.promise;
    const connect=page.locator('#connectBtn');
    await expect(connect).toBeDisabled(); // probe reason recorded
    await page.evaluate(()=>document.getElementById('updateAllBtn').click()); // modal blocks real clicks
    await updateStarted.promise;
    const refreshed=page.waitForResponse('**/api/skills?scope=project');
    updateHold.resolve();await settleResponse(page,await refreshed);
    await expect(connect).toBeDisabled(); // busy ended; the probe reason must survive
    probeHold.resolve();await bootStarted.promise;
    const seedInstall=page.locator('#seedInstall');
    await expect(seedInstall).toBeDisabled(); // seed actions created mid-busy
    await expect(page.locator('#connectDialog')).not.toBeVisible();
    const booted=page.waitForResponse('**/api/skills?scope=project');
    bootHold.resolve();await settleResponse(page,await booted);
    await expect(seedInstall).toBeEnabled();
    await expect(connect).toBeEnabled(); // probe reason cleared, no busy left
    expect(pageErrors).toEqual([]);
  }finally{
    probeHold.resolve();updateHold.resolve();bootHold.resolve();await context.close();
  }
});

// UI-06 (S-207): Space on the FOCUSED row checkbox must reach the native
// checkbox toggle — the delegated #skillList keydown may not preventDefault
// it away and steal the keypress for row selection.
test('Space toggles a focused checkbox without changing detail', async ({ browser }) => {
  const { page, context } = await openAuditPage(browser, origin);
  const checkbox = page.locator('#skillList li', { hasText: 'beta' }).locator('.skill-check');
  await checkbox.focus(); await page.keyboard.press('Space');
  await expect(checkbox).toBeChecked();
  await expect(page.locator('#selCount')).toHaveText('1');
  await expect(page.locator('.detail-title')).toHaveText('alpha');
  await page.keyboard.press('Space'); await expect(checkbox).not.toBeChecked();
  await context.close();
});

// UI-06 (S-207) positive controls: the escape guard must not weaken the row
// handler — Enter/Space on the FOCUSED ROW still select it (one detail change,
// checkbox untouched), and a mouse click on the checkbox toggles exactly once
// without selecting the row. Keyboard focus and the aria name stay intact.
test('Enter and Space on a focused row still select it', async ({ browser }) => {
  const { page, context } = await openAuditPage(browser, origin);
  const betaRow = page.locator('#skillList li', { hasText: 'beta' });
  const betaBox = betaRow.locator('.skill-check');
  await expect(betaRow).toBeVisible();
  await betaRow.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.detail-title')).toHaveText('beta');
  await expect(betaRow).toBeFocused(); // selection re-render keeps the row focusable and focused
  await expect(betaBox).not.toBeChecked(); // row Enter never toggles the checkbox
  await page.keyboard.press('Space');
  await expect(page.locator('.detail-title')).toHaveText('beta'); // row Space selects, it does not toggle
  await expect(betaBox).not.toBeChecked();
  await expect(page.locator('#selCount')).toHaveText('0');
  await context.close();
});

test('a mouse click toggles the checkbox exactly once without selecting the row', async ({ browser }) => {
  const { page, context } = await openAuditPage(browser, origin);
  const checkbox = page.locator('#skillList li', { hasText: 'beta' }).locator('.skill-check');
  await checkbox.click();
  await expect(checkbox).toBeChecked();
  await expect(page.locator('#selCount')).toHaveText('1');
  await expect(checkbox).toBeFocused();
  await expect(checkbox).toHaveAttribute('aria-label', 'Select beta for update');
  await expect(page.locator('.detail-title')).toHaveText('alpha'); // a checkbox click never selects the row
  await checkbox.click();
  await expect(checkbox).not.toBeChecked(); // exactly one toggle per activation
  await expect(page.locator('#selCount')).toHaveText('0');
  await expect(page.locator('.detail-title')).toHaveText('alpha');
  await context.close();
});

// S-260 (v0.5.4.1): unbreakable Name-Checkbox Unit + merging right-justified
// .result-actions inside .result-foot across 10%..50% listWidth.
test('search card keeps checkbox attached to name and merges or wraps contiguous right-justified actions', async ({ browser }) => {
  const { page, context } = await openAuditPage(browser, origin);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.route('**/api/search*', route =>
    route.fulfill({
      json: {
        results: [{ slug: 'org/repo', name: 'very-long-skill-identifier-name', source: 'org/repo', installs: 99 }],
        failed: false,
      },
    }),
  );
  await page.locator('[data-tab="search"]').click();
  await page.locator('#searchInput').fill('very');
  const card = page.locator('#results li').first();
  await expect(card).toBeVisible();

  // At 50% width (640px), short source 'org/repo' and .result-actions share one line
  const splitter = page.locator('#listSplitter');
  await splitter.focus();
  await page.keyboard.press('End');
  const srcWide = await card.locator('.result-source').boundingBox();
  const actWide = await card.locator('.result-actions').boundingBox();
  expect(Math.abs(srcWide!.y + srcWide!.height / 2 - (actWide!.y + actWide!.height / 2))).toBeLessThan(8);

  // At 15% width (192px), checkbox + name still share a row, and .result-actions
  // wraps below .result-source while keeping both buttons on the same row.
  await page.evaluate(() => {
    const r = document.getElementById('listWidthRange') as HTMLInputElement;
    r.value = '15';
    r.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const chkNarrow = await card.locator('.result-check').boundingBox();
  const nameNarrow = await card.locator('.result-name').boundingBox();
  expect(Math.abs(chkNarrow!.y + chkNarrow!.height / 2 - (nameNarrow!.y + nameNarrow!.height / 2))).toBeLessThan(6);

  const srcNarrow = await card.locator('.result-source').boundingBox();
  const addBtn = await card.locator('.add-btn').boundingBox();
  const installBtn = await card.locator('.install-btn').boundingBox();
  expect(addBtn!.y).toBeGreaterThanOrEqual(srcNarrow!.y + srcNarrow!.height - 2);
  expect(Math.abs(addBtn!.y - installBtn!.y)).toBeLessThan(4);
  await context.close();
});
