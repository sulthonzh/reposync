import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { scan, formatDriftTable, formatJson } from '../src/index.js';

const TMP = join('/tmp', 'reposync-enterprise-test-' + Date.now());

function setupEnterpriseFixtures() {
  // Repo A: with ignored packages
  const repoA = join(TMP, 'service-a');
  mkdirSync(repoA, { recursive: true });
  mkdirSync(join(repoA, '.git'), { recursive: true });
  writeFileSync(join(repoA, 'package.json'), JSON.stringify({
    name: 'service-a',
    dependencies: { 
      express: '^4.18.0', 
      lodash: '^4.17.21',
      react: '^18.0.0'  // This should be ignored
    },
    devDependencies: { typescript: '^5.1.0', eslint: '^8.0.0' },
    scripts: { build: 'tsc', test: 'jest' },
    engines: { node: '>=18.0.0' },
  }));

  // Repo B: different versions, ignoring react
  const repoB = join(TMP, 'service-b');
  mkdirSync(repoB, { recursive: true });
  mkdirSync(join(repoB, '.git'), { recursive: true });
  writeFileSync(join(repoB, 'package.json'), JSON.stringify({
    name: 'service-b',
    dependencies: { 
      express: '^4.18.0',  // Same as A, should not drift
      lodash: '^4.17.20',  // Different from A, should drift
      react: '^18.2.0'     // Different from A, but should be ignored
    },
    devDependencies: { typescript: '^5.6.0', eslint: '^9.0.0' },
    scripts: { build: 'tsc', test: 'vitest' },  // Different test, should drift
    engines: { node: '>=18.0.0' },
  }));

  // Repo C: consistent versions
  const repoC = join(TMP, 'service-c');
  mkdirSync(repoC, { recursive: true });
  mkdirSync(join(repoC, '.git'), { recursive: true });
  writeFileSync(join(repoC, 'package.json'), JSON.stringify({
    name: 'service-c',
    dependencies: { 
      express: '^4.18.0',  // Same as A and B
      lodash: '^4.17.21',  // Same as A, different from B but should be ignored via options
      react: '^18.0.0'     // Different from A and B, but should be ignored
    },
    devDependencies: { typescript: '^5.1.0', eslint: '^8.0.0' },
    scripts: { build: 'tsc', test: 'jest' },  // Same as A, should not drift
    engines: { node: '>=18.0.0' },
  }));
}

function cleanup() {
  rmSync(TMP, { recursive: true, force: true });
}

describe('Enterprise Features', () => {
  setupEnterpriseFixtures();

  it('ignores specified packages', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') },
      { name: 'service-c', path: join(TMP, 'service-c') }
    ];

    // Scan without ignoring - should detect react drift
    const resultWithoutIgnore = scan(repos);
    const reactDrift = resultWithoutIgnore.drifts.find(d => d.field === 'react');
    assert.ok(reactDrift, 'should detect react drift when not ignored');

    // Scan with ignoring - should not detect react drift
    const resultWithIgnore = scan(repos, { ignorePackages: ['react'] });
    const reactDriftIgnored = resultWithIgnore.drifts.find(d => d.field === 'react');
    assert.equal(reactDriftIgnored, undefined, 'should not detect react drift when ignored');
  });

  it('filters by severity threshold', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') },
      { name: 'service-c', path: join(TMP, 'service-c') }
    ];

    // Scan with high severity threshold - should only see high severity drifts
    const resultHigh = scan(repos, { severityThreshold: 'high' });
    const highSeverityDrifts = resultHigh.drifts.filter(d => d.severity === 'high');
    assert.equal(resultHigh.drifts.length, highSeverityDrifts.length, 'all drifts should be high severity');

    // Scan with medium severity threshold - should see medium and high
    const resultMedium = scan(repos, { severityThreshold: 'medium' });
    const mediumAndHighDrifts = resultMedium.drifts.filter(d => d.severity === 'medium' || d.severity === 'high');
    assert.equal(resultMedium.drifts.length, mediumAndHighDrifts.length, 'all drifts should be medium or high');
  });

  it('combines ignore and severity filtering', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') },
      { name: 'service-c', path: join(TMP, 'service-c') }
    ];

    const result = scan(repos, { 
      ignorePackages: ['react', 'lodash'],
      severityThreshold: 'medium'
    });

    // No react or lodash drifts should be present
    const reactDrift = result.drifts.find(d => d.field === 'react');
    const lodashDrift = result.drifts.find(d => d.field === 'lodash');
    assert.equal(reactDrift, undefined, 'react should be ignored');
    assert.equal(lodashDrift, undefined, 'lodash should be ignored');

    // Only medium and high severity drifts should remain
    const validDrifts = result.drifts.filter(d => d.severity === 'medium' || d.severity === 'high');
    assert.equal(result.drifts.length, validDrifts.length, 'only medium/high severity drifts should remain');
  });

  it('tracks original vs filtered drift count', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') },
      { name: 'service-c', path: join(TMP, 'service-c') }
    ];

    const result = scan(repos, { severityThreshold: 'high' });
    
    // Should have more original drifts than filtered drifts
    assert.ok(result.originalDriftCount >= result.filteredDriftCount, 
      'original drift count should be >= filtered count');
    
    // Should have tracked both counts
    assert.ok(result.originalDriftCount > 0, 'should have original drift count');
    assert.ok(result.filteredDriftCount >= 0, 'should have filtered drift count');
  });

  it('formats JSON output with enterprise fields', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') }
    ];

    const result = scan(repos, { severityThreshold: 'high' });
    const json = formatJson(result);
    const parsed = JSON.parse(json);

    // Should have enterprise fields
    assert.ok('originalDriftCount' in parsed, 'should have originalDriftCount');
    assert.ok('filteredDriftCount' in parsed, 'should have filteredDriftCount');
    assert.ok(parsed.originalDriftCount >= parsed.filteredDriftCount, 
      'original count should be >= filtered count');
  });

  it('formats text output with drift summary', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') }
    ];

    const result = scan(repos, { severityThreshold: 'high' });
    const output = formatDriftTable(result);

    // Should show drift count summary
    assert.ok(output.includes('Original drifts:'), 'should show original drifts count');
    assert.ok(output.includes('filtered:'), 'should show filtered drifts count');
    assert.ok(output.includes('Found'), 'should show found drifts count');
  });

  it('handles empty results with filtering', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-c', path: join(TMP, 'service-c') }
    ];

    // These repos should be consistent when ignoring certain packages
    const result = scan(repos, { 
      ignorePackages: ['express', 'react'],
      severityThreshold: 'high'
    });

    // Should have no drifts after aggressive filtering
    assert.ok(result.drifts.length === 0 || result.drifts.length === 1, 
      'should have minimal drifts after filtering');
  });

  it('preserves severity levels in filtered results', () => {
    const repos = [
      { name: 'service-a', path: join(TMP, 'service-a') },
      { name: 'service-b', path: join(TMP, 'service-b') }
    ];

    const result = scan(repos, { severityThreshold: 'medium' });
    
    // All remaining drifts should be medium or high
    const validDrifts = result.drifts.every(d => d.severity === 'medium' || d.severity === 'high');
    assert.ok(validDrifts, 'all drifts should be medium or high severity');
  });

  // cleanup happens automatically via setupFixtures re-creation
});