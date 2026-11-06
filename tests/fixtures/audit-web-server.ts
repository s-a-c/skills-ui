import { createSkillsUiServer } from '../../src/core/api.ts';
const server=await createSkillsUiServer({withPage:true,rateLimit:null});
console.log('AUDIT_ORIGIN '+JSON.stringify({origin:'http://127.0.0.1:'+server.port}));
process.on('SIGTERM',()=>{void server.stop().then(()=>process.exit(0));});
