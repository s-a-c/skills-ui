import { mkdirSync,mkdtempSync,rmSync } from 'node:fs';
import { resolve,join } from 'node:path';
export function deferred<T=void>(){
  // Promise.withResolvers is already used in the codebase (tests/serve-hardening.test.ts).
  const {promise,resolve,reject}=Promise.withResolvers<T>();
  return {promise,resolve,reject};
}
export function createWorkspaceFixture(){
  const base=resolve('.agents/tmp');mkdirSync(base,{recursive:true});
  const root=mkdtempSync(join(base,'skills-ui-test-'));
  const env={...process.env,
    SKILLS_UI_SKILLS_BIN:resolve('tests/fixtures/skills-shim.mjs'),
    SKILLS_UI_PREFS_DIR:join(root,'prefs'),SKILLS_UI_CACHE_DIR:join(root,'cache'),
    SKILLS_SHIM_STATE:join(root,'shim'),SKILLS_SHIM_CALLLOG:join(root,'calls.jsonl'),
    XDG_STATE_HOME:join(root,'xdg'),SKILLS_UI_API_URL:'http://127.0.0.1:1', // port 1 = deliberate dead endpoint; prevents real-backend access
    SKILLS_UI_HOSTED_TOKEN:'audit-remediation-fixture-token'
  };
  delete env.GITHUB_TOKEN;
  const keys=['SKILLS_UI_SKILLS_BIN','SKILLS_UI_PREFS_DIR','SKILLS_UI_CACHE_DIR',
    'SKILLS_SHIM_STATE','SKILLS_SHIM_CALLLOG','XDG_STATE_HOME','SKILLS_UI_API_URL','SKILLS_UI_HOSTED_TOKEN','GITHUB_TOKEN'];
  return {root,env,activate(){
    const old=new Map(keys.map(k=>[k,process.env[k]]));
    for(const key of keys){
      const value=env[key as keyof typeof env];
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
    return ()=>{for(const [key,value]of old){if(value===undefined)delete process.env[key];else process.env[key]=value;}};
  },cleanup(){rmSync(root,{recursive:true,force:true});}};
}
