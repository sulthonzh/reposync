import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

export interface RepoInfo {
  name: string;
  path: string;
}

export interface DriftItem {
  configType: string;
  field: string;
  values: Record<string, string[]>;
  severity: 'high' | 'medium' | 'low';
}

export interface ScanResult {
  repos: RepoInfo[];
  drifts: DriftItem[];
  scannedConfigs: string[];
  timestamp: string;
}

const CONFIG_FILES: Record<string, string[]> = {
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

function readJsonFile(filePath: string): unknown | null {
  try {
    const raw = readFileSync(filePath, 'utf-8').trim();
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTextFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf-8').trim();
  } catch {
    return null;
  }
}

export function discoverRepos(rootDir: string, depth: number = 1): RepoInfo[] {
  const repos: RepoInfo[] = [];
  const entries = readdirSync(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = join(rootDir, entry.name);
    if (!entry.isDirectory()) continue;

    if (existsSync(join(fullPath, '.git'))) {
      repos.push({ name: entry.name, path: fullPath });
    } else if (depth > 0 && statSync(fullPath).isDirectory()) {
      repos.push(...discoverRepos(fullPath, depth - 1));
    }
  }
  return repos;
}

function extractVersion(dep: unknown): string {
  if (typeof dep === 'string') return dep;
  return String(dep);
}

function compareDeps(repos: RepoInfo[], depType: string, drifts: DriftItem[]): void {
  const depVersions: Record<string, Record<string, string>> = {};

  for (const repo of repos) {
    const pkgPath = join(repo.path, 'package.json');
    const pkg = readJsonFile(pkgPath) as Record<string, Record<string, unknown>> | null;
    if (!pkg || !pkg[depType]) continue;

    for (const [dep, version] of Object.entries(pkg[depType])) {
      if (!depVersions[dep]) depVersions[dep] = {};
      depVersions[dep][repo.name] = extractVersion(version);
    }
  }

  for (const [dep, repoMap] of Object.entries(depVersions)) {
    const uniqueVersions = new Set(Object.values(repoMap));
    if (uniqueVersions.size > 1) {
      const values: Record<string, string[]> = {};
      for (const [repo, val] of Object.entries(repoMap)) values[repo] = [val];
      drifts.push({
        configType: `package.json/${depType}`,
        field: dep,
        values,
        severity: depType === 'dependencies' ? 'high' : 'medium',
      });
    }
  }
}

function compareScripts(repos: RepoInfo[], drifts: DriftItem[]): void {
  const allScripts = new Set<string>();
  const scriptMap: Record<string, Record<string, string>> = {};

  for (const repo of repos) {
    const pkgPath = join(repo.path, 'package.json');
    const pkg = readJsonFile(pkgPath) as Record<string, Record<string, string>> | null;
    if (!pkg?.scripts) continue;
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      allScripts.add(name);
      if (!scriptMap[name]) scriptMap[name] = {};
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
      const values: Record<string, string[]> = {};
      for (const [repo, val] of Object.entries(repoMap)) values[repo] = [val];
      drifts.push({
        configType: 'package.json/scripts',
        field: script,
        values,
        severity: 'low',
      });
    }
  }
}

function compareNodeVersions(repos: RepoInfo[], drifts: DriftItem[]): void {
  const versions: Record<string, string[]> = {};

  for (const repo of repos) {
    let version: string | null = null;

    for (const file of ['.node-version', '.nvmrc']) {
      const v = readTextFile(join(repo.path, file));
      if (v) { version = v; break; }
    }

    if (!version) {
      const pkg = readJsonFile(join(repo.path, 'package.json')) as Record<string, Record<string, string>> | null;
      if (pkg?.engines?.node) version = pkg.engines.node;
    }

    if (version) {
      if (!versions[version]) versions[version] = [];
      versions[version].push(repo.name);
    }
  }

  if (Object.keys(versions).length > 1) {
    const vals: Record<string, string[]> = {};
    for (const [v, names] of Object.entries(versions)) {
      for (const name of names) vals[name] = [v];
    }
    drifts.push({
      configType: 'node-version',
      field: 'node',
      values: vals,
      severity: 'high',
    });
  }
}

function compareJsonConfig(
  repos: RepoInfo[],
  fileName: string,
  fields: string[],
  drifts: DriftItem[]
): void {
  const allValues: Record<string, Record<string, string>> = {};

  for (const repo of repos) {
    const config = readJsonFile(join(repo.path, fileName)) as Record<string, unknown> | null;
    if (!config) continue;

    if (fields.length === 0) {
      const serialized = JSON.stringify(config, Object.keys(config).sort(), 2);
      if (!allValues[fileName]) allValues[fileName] = {};
      allValues[fileName][repo.name] = serialized;
    } else {
      for (const field of fields) {
        const val = config[field];
        if (val === undefined) continue;
        const serialized = JSON.stringify(val, Object.keys(val as object).sort(), 2);
        const key = `${fileName}/${field}`;
        if (!allValues[key]) allValues[key] = {};
        allValues[key][repo.name] = serialized;
      }
    }
  }

  for (const [key, repoMap] of Object.entries(allValues)) {
    const uniqueValues = new Set(Object.values(repoMap));
    if (uniqueValues.size > 1) {
      const field = fields.length === 0 ? fileName : key.split('/').pop()!;
      const vals: Record<string, string[]> = {};
      for (const [repo, v] of Object.entries(repoMap)) vals[repo] = [v];
      drifts.push({
        configType: fields.length === 0 ? fileName : key.replace(`/${field}`, ''),
        field,
        values: vals,
        severity: 'medium',
      });
    }
  }
}

function compareEngines(repos: RepoInfo[], drifts: DriftItem[]): void {
  const engineVersions: Record<string, Record<string, string>> = {};

  for (const repo of repos) {
    const pkg = readJsonFile(join(repo.path, 'package.json')) as Record<string, Record<string, string>> | null;
    if (!pkg?.engines) continue;

    for (const [engine, version] of Object.entries(pkg.engines)) {
      if (!engineVersions[engine]) engineVersions[engine] = {};
      engineVersions[engine][repo.name] = version;
    }
  }

  for (const [engine, repoMap] of Object.entries(engineVersions)) {
    if (engine === 'node') continue;
    const uniqueValues = new Set(Object.values(repoMap));
    if (uniqueValues.size > 1) {
      const values: Record<string, string[]> = {};
      for (const [repo, val] of Object.entries(repoMap)) values[repo] = [val];
      drifts.push({
        configType: 'package.json/engines',
        field: engine,
        values,
        severity: 'medium',
      });
    }
  }
}

export function scan(repos: RepoInfo[]): ScanResult {
  const drifts: DriftItem[] = [];
  const scannedConfigs: string[] = [];

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
    const hasAny = repos.some(r => existsSync(join(r.path, file)));
    if (hasAny) {
      compareJsonConfig(repos, file, fields, drifts);
      scannedConfigs.push(file);
    }
  }

  return { repos, drifts, scannedConfigs, timestamp: new Date().toISOString() };
}

export function formatDriftTable(result: ScanResult): string {
  const lines: string[] = [];

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

    const valueGroups: Record<string, string[]> = {};
    for (const [repo, vals] of Object.entries(drift.values)) {
      const key = vals.join(', ');
      if (!valueGroups[key]) valueGroups[key] = [];
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

export function formatJson(result: ScanResult): string {
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
