#!/usr/bin/env node

import { discoverRepos, scan, formatDriftTable, formatJson } from './index';
import { resolve } from 'path';

const args = process.argv.slice(2);

function showHelp(): void {
  console.log(`
reposync — detect config drift across your polyrepo setup

USAGE
  reposync <command> [options]

COMMANDS
  scan [path]     Scan repos for config drift (default: current dir)
  list [path]     List detected repos
  help            Show this help

OPTIONS
  --json          Output as JSON
  --depth <n>     Search depth for repos (default: 1)
  --ignore <pkg>  Ignore specific packages (can be used multiple times)
  --severity      Minimum severity level: high|medium|low (default: low)

EXAMPLES
  reposync scan ~/projects
  reposync scan . --json
  reposync scan . --ignore express --ignore lodash
  reposync scan . --severity medium
  reposync list ~/projects --depth 2
`);
}

const flags: Record<string, string | boolean | string[]> = {};
const positional: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') {
    flags.json = true;
  } else if (args[i] === '--depth' && args[i + 1]) {
    flags.depth = args[++i];
  } else if (args[i] === '--help' || args[i] === '-h') {
    flags.help = true;
  } else if (args[i] === '--ignore' && args[i + 1]) {
    if (!flags.ignore) flags.ignore = [];
    (flags.ignore as string[]).push(args[++i]);
  } else if (args[i] === '--severity' && args[i + 1]) {
    flags.severity = args[++i];
  } else {
    positional.push(args[i]);
  }
}

if (flags.help) {
  showHelp();
  process.exit(0);
}

const command = positional[0] || 'scan';
const targetPath = resolve(positional[1] || '.');
const depth = typeof flags.depth === 'string' ? parseInt(flags.depth, 10) : 1;

try {
  const repos = discoverRepos(targetPath, depth);

  if (repos.length === 0) {
    console.log('No git repos found in', targetPath);
    process.exit(1);
  }

  if (command === 'list') {
    if (flags.json) {
      console.log(JSON.stringify({ repos: repos.map(r => ({ name: r.name, path: r.path })) }, null, 2));
    } else {
      console.log(`Found ${repos.length} repo(s):\n`);
      for (const repo of repos) {
        console.log(`  ${repo.name}  (${repo.path})`);
      }
    }
    process.exit(0);
  }

  if (command === 'scan') {
    if (repos.length < 2) {
      console.log('Need at least 2 repos to detect drift. Found:', repos.length);
      process.exit(1);
    }

    const scanOptions = {
      ignorePackages: Array.isArray(flags.ignore) ? flags.ignore : [],
      severityThreshold: (flags.severity as 'high' | 'medium' | 'low') || 'low'
    };

    const result = scan(repos, scanOptions);
    console.log(flags.json ? formatJson(result) : formatDriftTable(result));

    if (result.drifts.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  }

  showHelp();
} catch (err: any) {
  console.error('Error:', err.message);
  process.exit(1);
}
