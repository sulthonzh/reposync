"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoverRepos = discoverRepos;
exports.scan = scan;
exports.formatDriftTable = formatDriftTable;
exports.formatJson = formatJson;
const fs_1 = require("fs");
const path_1 = require("path");
const CONFIG_FILES = {
    'tsconfig.json': ['compilerOptions'],
    '.eslintrc.json': ['rules', 'extends', 'plugins'],
    '.eslintrc': ['rules', 'extends', 'plugins'],
    '.prettierrc': [],
    '.prettierrc.json': [],
    'jest.config.json': [],
    'renovate.json': [],
    '.dependabot.yml': [],
    '.tool-versions': [],
};
function readJsonFile(filePath) {
    try {
        const raw = (0, fs_1.readFileSync)(filePath, 'utf-8').trim();
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
function readTextFile(filePath) {
    try {
        return (0, fs_1.readFileSync)(filePath, 'utf-8').trim();
    }
    catch {
        return null;
    }
}
function discoverRepos(rootDir, depth = 1) {
    const repos = [];
    const entries = (0, fs_1.readdirSync)(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
            continue;
        const fullPath = (0, path_1.join)(rootDir, entry.name);
        if (!entry.isDirectory())
            continue;
        if ((0, fs_1.existsSync)((0, path_1.join)(fullPath, '.git'))) {
            repos.push({ name: entry.name, path: fullPath });
        }
        else if (depth > 0 && (0, fs_1.statSync)(fullPath).isDirectory()) {
            repos.push(...discoverRepos(fullPath, depth - 1));
        }
    }
    return repos;
}
function extractVersion(dep) {
    if (typeof dep === 'string')
        return dep;
    return String(dep);
}
function compareDeps(repos, depType, drifts) {
    const depVersions = {};
    for (const repo of repos) {
        const pkgPath = (0, path_1.join)(repo.path, 'package.json');
        const pkg = readJsonFile(pkgPath);
        if (!pkg || !pkg[depType])
            continue;
        for (const [dep, version] of Object.entries(pkg[depType])) {
            if (!depVersions[dep])
                depVersions[dep] = {};
            depVersions[dep][repo.name] = extractVersion(version);
        }
    }
    for (const [dep, repoMap] of Object.entries(depVersions)) {
        const uniqueVersions = new Set(Object.values(repoMap));
        if (uniqueVersions.size > 1) {
            const values = {};
            for (const [repo, val] of Object.entries(repoMap))
                values[repo] = [val];
            drifts.push({
                configType: `package.json/${depType}`,
                field: dep,
                values,
                severity: depType === 'dependencies' ? 'high' : 'medium',
            });
        }
    }
}
function compareScripts(repos, drifts) {
    const allScripts = new Set();
    const scriptMap = {};
    for (const repo of repos) {
        const pkgPath = (0, path_1.join)(repo.path, 'package.json');
        const pkg = readJsonFile(pkgPath);
        if (!pkg?.scripts)
            continue;
        for (const [name, cmd] of Object.entries(pkg.scripts)) {
            allScripts.add(name);
            if (!scriptMap[name])
                scriptMap[name] = {};
            scriptMap[name][repo.name] = cmd;
        }
    }
    const commonScripts = [...allScripts].filter(s => {
        const reposWithScript = Object.keys(scriptMap[s]).length;
        return reposWithScript >= Math.max(2, Math.ceil(repos.length * 0.3));
    });
    for (const script of commonScripts) {
        const repoMap = scriptMap[script];
        const uniqueValues = new Set(Object.values(repoMap));
        if (uniqueValues.size > 1) {
            const values = {};
            for (const [repo, val] of Object.entries(repoMap))
                values[repo] = [val];
            drifts.push({
                configType: 'package.json/scripts',
                field: script,
                values,
                severity: 'low',
            });
        }
    }
}
function compareNodeVersions(repos, drifts) {
    const versions = {};
    for (const repo of repos) {
        let version = null;
        for (const file of ['.node-version', '.nvmrc']) {
            const v = readTextFile((0, path_1.join)(repo.path, file));
            if (v) {
                version = v;
                break;
            }
        }
        if (!version) {
            const pkg = readJsonFile((0, path_1.join)(repo.path, 'package.json'));
            if (pkg?.engines?.node)
                version = pkg.engines.node;
        }
        if (version) {
            if (!versions[version])
                versions[version] = [];
            versions[version].push(repo.name);
        }
    }
    if (Object.keys(versions).length > 1) {
        const vals = {};
        for (const [v, names] of Object.entries(versions)) {
            for (const name of names)
                vals[name] = [v];
        }
        drifts.push({
            configType: 'node-version',
            field: 'node',
            values: vals,
            severity: 'high',
        });
    }
}
function compareJsonConfig(repos, fileName, fields, drifts) {
    const allValues = {};
    for (const repo of repos) {
        const config = readJsonFile((0, path_1.join)(repo.path, fileName));
        if (!config)
            continue;
        if (fields.length === 0) {
            const serialized = JSON.stringify(config, Object.keys(config).sort(), 2);
            if (!allValues[fileName])
                allValues[fileName] = {};
            allValues[fileName][repo.name] = serialized;
        }
        else {
            for (const field of fields) {
                const val = config[field];
                if (val === undefined)
                    continue;
                const serialized = JSON.stringify(val, Object.keys(val).sort(), 2);
                const key = `${fileName}/${field}`;
                if (!allValues[key])
                    allValues[key] = {};
                allValues[key][repo.name] = serialized;
            }
        }
    }
    for (const [key, repoMap] of Object.entries(allValues)) {
        const uniqueValues = new Set(Object.values(repoMap));
        if (uniqueValues.size > 1) {
            const field = fields.length === 0 ? fileName : key.split('/').pop();
            const vals = {};
            for (const [repo, v] of Object.entries(repoMap))
                vals[repo] = [v];
            drifts.push({
                configType: fields.length === 0 ? fileName : key.replace(`/${field}`, ''),
                field,
                values: vals,
                severity: 'medium',
            });
        }
    }
}
function compareEngines(repos, drifts) {
    const engineVersions = {};
    for (const repo of repos) {
        const pkg = readJsonFile((0, path_1.join)(repo.path, 'package.json'));
        if (!pkg?.engines)
            continue;
        for (const [engine, version] of Object.entries(pkg.engines)) {
            if (!engineVersions[engine])
                engineVersions[engine] = {};
            engineVersions[engine][repo.name] = version;
        }
    }
    for (const [engine, repoMap] of Object.entries(engineVersions)) {
        if (engine === 'node')
            continue;
        const uniqueValues = new Set(Object.values(repoMap));
        if (uniqueValues.size > 1) {
            const values = {};
            for (const [repo, val] of Object.entries(repoMap))
                values[repo] = [val];
            drifts.push({
                configType: 'package.json/engines',
                field: engine,
                values,
                severity: 'medium',
            });
        }
    }
}
function scan(repos) {
    const drifts = [];
    const scannedConfigs = [];
    compareDeps(repos, 'dependencies', drifts);
    compareDeps(repos, 'devDependencies', drifts);
    scannedConfigs.push('package.json (dependencies, devDependencies)');
    compareScripts(repos, drifts);
    scannedConfigs.push('package.json (scripts)');
    compareEngines(repos, drifts);
    scannedConfigs.push('package.json (engines)');
    compareNodeVersions(repos, drifts);
    scannedConfigs.push('.node-version / .nvmrc');
    for (const [file, fields] of Object.entries(CONFIG_FILES)) {
        const hasAny = repos.some(r => (0, fs_1.existsSync)((0, path_1.join)(r.path, file)));
        if (hasAny) {
            compareJsonConfig(repos, file, fields, drifts);
            scannedConfigs.push(file);
        }
    }
    return { repos, drifts, scannedConfigs, timestamp: new Date().toISOString() };
}
function formatDriftTable(result) {
    const lines = [];
    lines.push(`reposync — config drift report`);
    lines.push(`Repos scanned: ${result.repos.map(r => r.name).join(', ')}`);
    lines.push(`Configs checked: ${result.scannedConfigs.join(', ')}`);
    lines.push('');
    if (result.drifts.length === 0) {
        lines.push('✅ No drift detected. All repos are consistent.');
        return lines.join('\n');
    }
    lines.push(`⚠️  Found ${result.drifts.length} drift(s):`);
    lines.push('');
    for (const drift of result.drifts) {
        const severityIcon = drift.severity === 'high' ? '🔴' : drift.severity === 'medium' ? '🟡' : '🔵';
        lines.push(`${severityIcon} [${drift.severity.toUpperCase()}] ${drift.configType} → ${drift.field}`);
        const valueGroups = {};
        for (const [repo, vals] of Object.entries(drift.values)) {
            const key = vals.join(', ');
            if (!valueGroups[key])
                valueGroups[key] = [];
            valueGroups[key].push(repo);
        }
        for (const [value, repoNames] of Object.entries(valueGroups)) {
            const displayValue = value.length > 80 ? value.slice(0, 77) + '...' : value;
            lines.push(`   ${displayValue}  ← ${repoNames.join(', ')}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
function formatJson(result) {
    return JSON.stringify({
        repos: result.repos.map(r => r.name),
        scannedConfigs: result.scannedConfigs,
        driftCount: result.drifts.length,
        drifts: result.drifts.map(d => ({
            configType: d.configType,
            field: d.field,
            severity: d.severity,
            values: d.values,
        })),
        timestamp: result.timestamp,
    }, null, 2);
}
//# sourceMappingURL=index.js.map