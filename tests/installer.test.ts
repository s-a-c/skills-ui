import { describe, expect, test } from 'bun:test';
import { chmodSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createInstallerFixture } from './helpers/installer-fixture.ts';

describe('installer', () => {
  // Reasserts the fixture contract before every run: the scratch destination
  // starts as an executable script that the installer must never degrade.
  function spawnInstaller(fixture: ReturnType<typeof createInstallerFixture>) {
    chmodSync(fixture.installed, 0o755);
    return Bun.spawn(['sh', 'scripts/install.sh', 'v0.5.3.1'],
      { env: fixture.env, stdout: 'pipe', stderr: 'pipe' });
  }

  function executableMode(path: string): number {
    return statSync(path).mode & 0o111;
  }

  test('chmod failure preserves the old installed executable', async () => {
    const fixture = createInstallerFixture({ chmodFails: true });
    try {
      const child = spawnInstaller(fixture);
      await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect(await child.exited).not.toBe(0);
      expect(readFileSync(fixture.installed, 'utf8')).toBe('OLD_EXECUTABLE');
      expect(executableMode(fixture.installed)).not.toBe(0);
      expect(readdirSync(fixture.dest).filter(n => n.endsWith('.tmp'))).toEqual([]);
    } finally { fixture.cleanup(); }
  }, 30000); // real sh/curl/chmod/mv forks cost ~0.3-0.7s each here — bun's 5s default is too tight

  test('successful install publishes an executable binary that runs', async () => {
    const fixture = createInstallerFixture({ chmodFails: false });
    try {
      const child = spawnInstaller(fixture);
      await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect(await child.exited).toBe(0);
      expect(readFileSync(fixture.installed, 'utf8')).toBe('#!/bin/sh\necho FIXTURE_INSTALLED\n');
      expect(executableMode(fixture.installed)).not.toBe(0);
      // Only the published binary remains — the owned stage/temp path is gone.
      expect(readdirSync(fixture.dest)).toEqual(['skills-ui']);
      const run = Bun.spawn([fixture.installed], { stdout: 'pipe', stderr: 'pipe' });
      const out = await new Response(run.stdout).text();
      expect(await run.exited).toBe(0);
      expect(out).toContain('FIXTURE_INSTALLED');
    } finally { fixture.cleanup(); }
  }, 30000); // real sh/curl/chmod/mv forks cost ~0.3-0.7s each here — bun's 5s default is too tight

  test('checksum failure preserves the old installed executable', async () => {
    const fixture = createInstallerFixture({ checksumFails: true });
    try {
      const child = spawnInstaller(fixture);
      await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect(await child.exited).not.toBe(0);
      expect(readFileSync(fixture.installed, 'utf8')).toBe('OLD_EXECUTABLE');
      expect(executableMode(fixture.installed)).not.toBe(0);
      expect(readdirSync(fixture.dest).filter(n => n.endsWith('.tmp'))).toEqual([]);
    } finally { fixture.cleanup(); }
  }, 30000); // real sh/curl/chmod/mv forks cost ~0.3-0.7s each here — bun's 5s default is too tight

  test('interrupted download preserves the old installed executable', async () => {
    const fixture = createInstallerFixture({ downloadFails: true });
    try {
      const child = spawnInstaller(fixture);
      await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
      expect(await child.exited).not.toBe(0);
      expect(readFileSync(fixture.installed, 'utf8')).toBe('OLD_EXECUTABLE');
      expect(executableMode(fixture.installed)).not.toBe(0);
      // The partial download is an owned stage path — the trap must sweep it.
      expect(readdirSync(fixture.dest).filter(n => n.endsWith('.tmp'))).toEqual([]);
    } finally { fixture.cleanup(); }
  }, 30000); // real sh/curl/chmod/mv forks cost ~0.3-0.7s each here — bun's 5s default is too tight
});
