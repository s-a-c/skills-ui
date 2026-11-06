import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const dir=resolve(process.argv[2]||'dist');
const version=JSON.parse(readFileSync('package.json','utf8')).version;
const entries=readFileSync(join(dir,'checksums-'+version+'.txt'),'utf8').trim().split('\n');
const hashes=new Map(entries.map(line=>{const [hash,name]=line.split(/  /);return [name,hash];}));
const targets=[
  ['darwin-arm64',/Mach-O.*arm64/],['darwin-x64',/Mach-O.*x86_64/],
  ['linux-arm64',/ELF.*ARM aarch64/],['linux-x64',/ELF.*x86-64/]
] as const;
for(const [target,pattern]of targets){
  const name='skills-ui-'+version+'-'+target,path=join(dir,name);
  const result=spawnSync('file',['--brief',path],{encoding:'utf8'});
  assert.equal(result.status,0);assert.match(result.stdout,pattern,target);
  const actual=createHash('sha256').update(readFileSync(path)).digest('hex');
  assert.equal(actual,hashes.get(name),name);
}
console.log('BUILD_TARGET_FORMATS_AND_CHECKSUMS_VERIFIED');
