import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {expect,type Browser,type Page,type Response as BrowserResponse} from '@playwright/test';
import {createWorkspaceFixture} from '../../helpers/audit-state.ts';
const cases:Array<{context:Awaited<ReturnType<Browser['newContext']>>;errors:string[]}>=[];
export async function closeAuditPages(){
  for(const item of cases.splice(0)){try{expect(item.errors).toEqual([]);}finally{await item.context.close();}}
}
export async function startAuditBackend(){
  const fixture=createWorkspaceFixture();
  const child=spawn('bun',['run','tests/fixtures/audit-web-server.ts'],
    {env:fixture.env,stdio:['ignore','pipe','pipe']});
  let output='';
  try{
    const origin=await new Promise<string>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('audit backend startup deadline: '+output)),10000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);reject(new Error('backend exited '+code+': '+output));});
      child.stderr.on('data',b=>{output+=b.toString();});
      child.stdout.on('data',b=>{
        output+=b.toString();
        const line=output.split('\n').find(x=>x.startsWith('AUDIT_ORIGIN '));
        if(line){clearTimeout(timer);resolve(JSON.parse(line.slice(13)).origin);}
      });
    });
    return {origin,async stop(){
      if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGTERM');await ended;}
      fixture.cleanup();
    }};
  }catch(error){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');fixture.cleanup();throw error;}
}
export function row(name:string,scope='project'){
  return {name,scope,path:'/fixture/'+scope+'/'+name,description:name,
    agents:['Claude Code'],source:'fixture/repo',sourceType:'github',sourceUrl:null};
}
export async function openAuditPage(browser:Browser,origin:string){
  const context=await browser.newContext(),page=await context.newPage();
  const pageErrors:string[]=[];cases.push({context,errors:pageErrors});
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),scope=url.searchParams.get('scope')||'project';
    if(url.pathname==='/api/skills')return route.fulfill({json:{scope,skills:[row('alpha',scope),row('beta',scope)]}});
    if(url.pathname==='/api/skill')return route.fulfill({json:{body:'BODY_'+url.searchParams.get('name')}});
    if(url.pathname==='/api/updates')return route.fulfill({json:{scope,updates:{},checkedCount:0}});
    if(url.pathname==='/api/search')return route.fulfill({json:{results:[
      {name:'new-one',slug:'new-one',source:'one/repo',installs:1},
      {name:'new-two',slug:'new-two',source:'two/repo',installs:1}
    ],adjustedQuery:null}});
    if(url.pathname==='/api/install')return route.fulfill({json:{ok:true,output:'installed fixture'}});
    return route.continue();
  });
  await page.goto(origin);await expect(page.locator('#skillList')).toContainText('alpha');
  await expect(page.locator('#readme')).toContainText('BODY_alpha');
  return {page,context,pageErrors};
}
export async function settleResponse(page:Page,response:BrowserResponse){
  await response.finished();
  await page.evaluate(()=>new Promise<void>(done=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
}
