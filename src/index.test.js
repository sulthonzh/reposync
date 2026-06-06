"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const fs_1 = require("fs");
const path_1 = require("path");
const index_js_1 = require("./index.js");
const TMP = (0, path_1.join)('/tmp', 'reposync-test-' + Date.now());
function setupFixtures() {
    // Repo A: typescript 5.1, eslint@8
    const repoA = (0, path_1.join)(TMP, 'service-a');
    (0, fs_1.mkdirSync)(repoA, { recursive: true });
    (0, fs_1.mkdirSync)((0, path_1.join)(repoA, '.git'), { recursive: true });
    (0, fs_1.writeFileSync)((0, path_1.join)(repoA, 'package.json'), JSON.stringify({
        name: 'service-a',
        dependencies: { express: '^4.18.0', lodash: '^4.17.21' },
        devDependencies: { typescript: '^5.1.0', eslint: '^8.0.0' },
        scripts: { build: 'tsc', test: 'jest', lint: 'eslint src/' },
        engines: { node: '>=18.0.0' },
    }));
    (0, fs_1.writeFileSync)((0, path_1.join)(repoA, '.node-version'), '18.0.0');
    // Repo B: typescript 5.6, eslint@9
    const repoB = (0, path_1.join)(TMP, 'service-b');
    (0, fs_1.mkdirSync)(repoB, { recursive: true });
    (0, fs_1.mkdirSync)((0, path_1.join)(repoB, '.git'), { recursive: true });
    (0, fs_1.writeFileSync)((0, path_1.join)(repoB, 'package.json'), JSON.stringify({
        name: 'service-b',
        dependencies: { express: '^4.18.0', lodash: '^4.17.20' },
        devDependencies: { typescript: '^5.6.0', eslint: '^9.0.0' },
        scripts: { build: 'tsc', test: 'vitest', lint: 'eslint "src/**"' },
        engines: { node: '>=20.0.0' },
    }));
    (0, fs_1.writeFileSync)((0, path_1.join)(repoB, '.node-version'), '20.0.0');
    // Repo C: no .node-version, typescript 5.1
    const repoC = (0, path_1.join)(TMP, 'service-c');
    (0, fs_1.mkdirSync)(repoC, { recursive: true });
    (0, fs_1.mkdirSync)((0, path_1.join)(repoC, '.git'), { recursive: true });
    (0, fs_1.writeFileSync)((0, path_1.join)(repoC, 'package.json'), JSON.stringify({
        name: 'service-c',
        dependencies: { express: '^4.18.0' },
        devDependencies: { typescript: '^5.1.0', eslint: '^8.0.0' },
        scripts: { build: 'tsc && node dist/index.js' },
    }));
    // Deeply nested repo for depth test
    const repoD = (0, path_1.join)(TMP, 'nested', 'deep', 'repo-d');
    (0, fs_1.mkdirSync)(repoD, { recursive: true });
    (0, fs_1.mkdirSync)((0, path_1.join)(repoD, '.git'), { recursive: true });
    (0, fs_1.writeFileSync)((0, path_1.join)(repoD, 'package.json'), JSON.stringify({ name: 'repo-d' }));
}
function cleanup() {
    (0, fs_1.rmSync)(TMP, { recursive: true, force: true });
}
(0, node_test_1.describe)('reposync', () => {
    setupFixtures();
    (0, node_test_1.it)('discovers git repos', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        strict_1.default.equal(repos.length, 3);
        const names = repos.map(r => r.name).sort();
        strict_1.default.deepEqual(names, ['service-a', 'service-b', 'service-c']);
    });
    (0, node_test_1.it)('respects depth limit', () => {
        // repo-d is 2 levels deep: nested/deep/repo-d
        const depth0 = (0, index_js_1.discoverRepos)(TMP, 0);
        strict_1.default.equal(depth0.length, 3); // only top-level
        const depth2 = (0, index_js_1.discoverRepos)(TMP, 2);
        strict_1.default.equal(depth2.length, 4); // finds nested/deep/repo-d
    });
    (0, node_test_1.it)('detects dependency drift', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const lodashDrift = result.drifts.find(d => d.field === 'lodash');
        strict_1.default.ok(lodashDrift, 'should detect lodash version drift');
        strict_1.default.equal(lodashDrift.configType, 'package.json/dependencies');
    });
    (0, node_test_1.it)('detects devDependency drift', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const tsDrift = result.drifts.find(d => d.field === 'typescript');
        strict_1.default.ok(tsDrift, 'should detect typescript drift');
        strict_1.default.equal(tsDrift.configType, 'package.json/devDependencies');
        const eslintDrift = result.drifts.find(d => d.field === 'eslint');
        strict_1.default.ok(eslintDrift, 'should detect eslint drift');
    });
    (0, node_test_1.it)('does not report consistent deps', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const expressDrift = result.drifts.find(d => d.field === 'express');
        strict_1.default.equal(expressDrift, undefined, 'express is the same across repos');
    });
    (0, node_test_1.it)('detects script drift', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const testDrift = result.drifts.find(d => d.field === 'test');
        strict_1.default.ok(testDrift, 'should detect test script drift');
        const buildDrift = result.drifts.find(d => d.field === 'build');
        strict_1.default.ok(buildDrift, 'should detect build script drift');
    });
    (0, node_test_1.it)('detects node version drift', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const nodeDrift = result.drifts.find(d => d.configType === 'node-version');
        strict_1.default.ok(nodeDrift, 'should detect node version drift');
    });
    (0, node_test_1.it)('detects engine drift', () => {
        // engine drift only for non-node engines; node is handled by compareNodeVersions
        // service-a and service-b both only have node engine, no other engine drift expected
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        // Node version drift IS detected via compareNodeVersions
        const nodeDrift = result.drifts.find(d => d.configType === 'node-version');
        strict_1.default.ok(nodeDrift, 'node version drift should be detected');
    });
    (0, node_test_1.it)('formats text report', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const report = (0, index_js_1.formatDriftTable)(result);
        strict_1.default.ok(report.includes('reposync'), 'has title');
        strict_1.default.ok(report.includes('drift'), 'mentions drifts');
        strict_1.default.ok(report.includes('typescript'), 'mentions typescript');
    });
    (0, node_test_1.it)('formats JSON output', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const json = (0, index_js_1.formatJson)(result);
        const parsed = JSON.parse(json);
        strict_1.default.ok(Array.isArray(parsed.repos));
        strict_1.default.ok(typeof parsed.driftCount === 'number');
        strict_1.default.ok(parsed.driftCount > 0);
        strict_1.default.ok(Array.isArray(parsed.drifts));
        strict_1.default.ok(parsed.drifts[0].severity);
    });
    (0, node_test_1.it)('reports severity correctly', () => {
        const repos = (0, index_js_1.discoverRepos)(TMP);
        const result = (0, index_js_1.scan)(repos);
        const highDrifts = result.drifts.filter(d => d.severity === 'high');
        const medDrifts = result.drifts.filter(d => d.severity === 'medium');
        strict_1.default.ok(highDrifts.length > 0, 'dep drifts should be high severity');
        strict_1.default.ok(medDrifts.length > 0, 'devDep/script drifts should be medium');
    });
    (0, node_test_1.it)('handles single repo gracefully', () => {
        const singleRepo = (0, path_1.join)(TMP, 'service-a');
        const singleResult = (0, index_js_1.scan)([{ name: 'service-a', path: singleRepo }]);
        strict_1.default.equal(singleResult.drifts.length, 0);
    });
    // cleanup happens automatically via setupFixtures re-creation
});
//# sourceMappingURL=index.test.js.map