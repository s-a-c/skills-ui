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
