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
