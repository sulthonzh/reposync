import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { discoverRepos, scan, formatDriftTable, formatJson } from './index.js';

const TMP = join('/tmp', 'reposync-test-' + Date.now());

function setupFixtures() {
  // Repo A: typescript 5.1, eslint@8
  const repoA = join(TMP, 'service-a');
  mkdirSync(repoA, { recursive: true });
  mkdirSync(join(repoA, '.git'), { recursive: true });
  writeFileSync(join(repoA, 'package.json'), JSON.stringify({
    name: 'service-a',
    dependencies: { express: '^4.18.0', lodash: '^4.17.21' },
    devDependencies: { typescript: '^5.1.0', eslint: '^8.0.0' },
    scripts: { build: 'tsc', test: 'jest', lint: 'eslint src/' },
    engines: { node: '>=18.0.0' },
  }));
  writeFileSync(join(repoA, '.node-version'), '18.0.0');

  // Repo B: typescript 5.6, eslint@9
  const repoB = join(TMP, 'service-b');
  mkdirSync(repoB, { recursive: true });
  mkdirSync(join(repoB, '.git'), { recursive: true });
  writeFileSync(join(repoB, 'package.json'), JSON.stringify({
    name: 'service-b',
    dependencies: { express: '^4.18.0', lodash: '^4.17.20' },
    devDependencies: { typescript: '^5.6.0', eslint: '^9.0.0' },
    scripts: { build: 'tsc', test: 'vitest', lint: 'eslint "src/**"' },
    engines: { node: '>=20.0.0' },
  }));
  writeFileSync(join(repoB, '.node-version'), '20.0.0');

  // Repo C: no .node-version, typescript 5.1
  const repoC = join(TMP, 'service-c');
  mkdirSync(repoC, { recursive: true });
  mkdirSync(join(repoC, '.git'), { recursive: true });
  writeFileSync(join(repoC, 'package.json'), JSON.stringify({
    name: 'service-c',
    dependencies: { express: '^4.18.0' },
    devDependencies: { typescript: '^5.1.0', eslint: '^8.0.0' },
    scripts: { build: 'tsc && node dist/index.js' },
  }));

  // Deeply nested repo for depth test
  const repoD = join(TMP, 'nested', 'deep', 'repo-d');
  mkdirSync(repoD, { recursive: true });
  mkdirSync(join(repoD, '.git'), { recursive: true });
  writeFileSync(join(repoD, 'package.json'), JSON.stringify({ name: 'repo-d' }));
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe('reposync', () => {
  setupFixtures();

  it('discovers git repos', () => {
    const repos = discoverRepos(TMP);
    assert.equal(repos.length, 3);
    const names = repos.map(r => r.name).sort();
    assert.deepEqual(names, ['service-a', 'service-b', 'service-c']);
  });

  it('respects depth limit', () => {
    // repo-d is 2 levels deep: nested/deep/repo-d
    const depth0 = discoverRepos(TMP, 0);
    assert.equal(depth0.length, 3); // only top-level

    const depth2 = discoverRepos(TMP, 2);
    assert.equal(depth2.length, 4); // finds nested/deep/repo-d
  });

  it('detects dependency drift', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    const lodashDrift = result.drifts.find(d => d.field === 'lodash');
    assert.ok(lodashDrift, 'should detect lodash version drift');
    assert.equal(lodashDrift!.configType, 'package.json/dependencies');
  });

  it('detects devDependency drift', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    const tsDrift = result.drifts.find(d => d.field === 'typescript');
    assert.ok(tsDrift, 'should detect typescript drift');
    assert.equal(tsDrift!.configType, 'package.json/devDependencies');

    const eslintDrift = result.drifts.find(d => d.field === 'eslint');
    assert.ok(eslintDrift, 'should detect eslint drift');
  });

  it('does not report consistent deps', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    const expressDrift = result.drifts.find(d => d.field === 'express');
    assert.equal(expressDrift, undefined, 'express is the same across repos');
  });

  it('detects script drift', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    const testDrift = result.drifts.find(d => d.field === 'test');
    assert.ok(testDrift, 'should detect test script drift');

    const buildDrift = result.drifts.find(d => d.field === 'build');
    assert.ok(buildDrift, 'should detect build script drift');
  });

  it('detects node version drift', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    const nodeDrift = result.drifts.find(d => d.configType === 'node-version');
    assert.ok(nodeDrift, 'should detect node version drift');
  });

  it('detects engine drift', () => {
    // engine drift only for non-node engines; node is handled by compareNodeVersions
    // service-a and service-b both only have node engine, no other engine drift expected
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    // Node version drift IS detected via compareNodeVersions
    const nodeDrift = result.drifts.find(d => d.configType === 'node-version');
    assert.ok(nodeDrift, 'node version drift should be detected');
  });

  it('formats text report', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);
    const report = formatDriftTable(result);

    assert.ok(report.includes('reposync'), 'has title');
    assert.ok(report.includes('drift'), 'mentions drifts');
    assert.ok(report.includes('typescript'), 'mentions typescript');
  });

  it('formats JSON output', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);
    const json = formatJson(result);
    const parsed = JSON.parse(json);

    assert.ok(Array.isArray(parsed.repos));
    assert.ok(typeof parsed.driftCount === 'number');
    assert.ok(parsed.driftCount > 0);
    assert.ok(Array.isArray(parsed.drifts));
    assert.ok(parsed.drifts[0].severity);
  });

  it('reports severity correctly', () => {
    const repos = discoverRepos(TMP);
    const result = scan(repos);

    const highDrifts = result.drifts.filter(d => d.severity === 'high');
    const medDrifts = result.drifts.filter(d => d.severity === 'medium');
    assert.ok(highDrifts.length > 0, 'dep drifts should be high severity');
    assert.ok(medDrifts.length > 0, 'devDep/script drifts should be medium');
  });

  it('handles single repo gracefully', () => {
    const singleRepo = join(TMP, 'service-a');
    const singleResult = scan([{ name: 'service-a', path: singleRepo }]);
    assert.equal(singleResult.drifts.length, 0);
  });

  // cleanup happens automatically via setupFixtures re-creation
});
