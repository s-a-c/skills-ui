import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createWorkspaceFixture} from './audit-state.ts';
// Appendix fixture from task-16-brief, extended with the checksumFails and
// downloadFails knobs that step 4's checksum-failure and interrupted-download
// controls require; everything else is verbatim.
export function createInstallerFixture({chmodFails=false,checksumFails=false,downloadFails=false}={}){
  const fixture=createWorkspaceFixture(),bin=join(fixture.root,'bin'),dest=join(fixture.root,'dest');
  const tmp=join(fixture.root,'tmp');for(const p of [bin,dest,tmp])mkdirSync(p,{recursive:true});
  const installed=join(dest,'skills-ui');writeFileSync(installed,'OLD_EXECUTABLE');chmodSync(installed,0o755);
  const payload=join(fixture.root,'payload');writeFileSync(payload,'#!/bin/sh\necho FIXTURE_INSTALLED\n');
  const checksum=join(fixture.root,'checksums');
  const hash=createHash('sha256').update(checksumFails?'MISMATCHED PAYLOAD':'#!/bin/sh\necho FIXTURE_INSTALLED\n').digest('hex');
  writeFileSync(checksum,hash+'  skills-ui-0.5.3.1-darwin-arm64\n');
  const scripts:Record<string,string>={
    uname:'#!/bin/sh\ncase "$1" in -s) echo Darwin;; -m) echo arm64;; esac\n',
    curl:'#!/bin/sh\nwhile [ "$#" -gt 0 ]; do case "$1" in -o) shift; out="$1";; http*) url="$1";; esac; shift; done\nif [ "$SKILLS_UI_AUDIT_DOWNLOAD_FAIL" = 1 ]; then printf partial > "$out"; exit 18; fi\ncase "$url" in *checksums*) cp "$SKILLS_UI_AUDIT_CHECKSUM" "$out";; *) cp "$SKILLS_UI_AUDIT_PAYLOAD" "$out";; esac\n',
    chmod:'#!/bin/sh\nif [ "$SKILLS_UI_AUDIT_CHMOD_FAIL" = 1 ]; then exit 73; fi\nexec /bin/chmod "$@"\n'
  };
  for(const [name,text]of Object.entries(scripts)){const p=join(bin,name);writeFileSync(p,text);chmodSync(p,0o755);}
  return {dest,installed,cleanup:fixture.cleanup,env:{...fixture.env,PATH:bin+':'+process.env.PATH,
    SKILLS_UI_INSTALL_DIR:dest,TMPDIR:tmp,SKILLS_UI_AUDIT_PAYLOAD:payload,SKILLS_UI_AUDIT_CHECKSUM:checksum,
    SKILLS_UI_AUDIT_CHMOD_FAIL:chmodFails?'1':'0',SKILLS_UI_AUDIT_DOWNLOAD_FAIL:downloadFails?'1':'0'}};
}
