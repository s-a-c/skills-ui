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
    await page.locator('[data-sview="selected"]').click();
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
    await page.locator('[data-sview="selected"]').click();
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
    await page.locator('[data-sview="selected"]').click();
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
