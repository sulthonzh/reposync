#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
const path_1 = require("path");
const args = process.argv.slice(2);
function showHelp() {
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

EXAMPLES
  reposync scan ~/projects
  reposync scan . --json
  reposync list ~/projects --depth 2
`);
}
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--json') {
        flags.json = true;
    }
    else if (args[i] === '--depth' && args[i + 1]) {
        flags.depth = args[++i];
    }
    else if (args[i] === '--help' || args[i] === '-h') {
        flags.help = true;
    }
    else {
        positional.push(args[i]);
    }
}
if (flags.help) {
    showHelp();
    process.exit(0);
}
const command = positional[0] || 'scan';
const targetPath = (0, path_1.resolve)(positional[1] || '.');
const depth = typeof flags.depth === 'string' ? parseInt(flags.depth, 10) : 1;
try {
    const repos = (0, index_1.discoverRepos)(targetPath, depth);
    if (repos.length === 0) {
        console.log('No git repos found in', targetPath);
        process.exit(1);
    }
    if (command === 'list') {
        if (flags.json) {
            console.log(JSON.stringify({ repos: repos.map(r => ({ name: r.name, path: r.path })) }, null, 2));
        }
        else {
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
        const result = (0, index_1.scan)(repos);
        console.log(flags.json ? (0, index_1.formatJson)(result) : (0, index_1.formatDriftTable)(result));
        if (result.drifts.length > 0) {
            process.exit(1);
        }
        process.exit(0);
    }
    showHelp();
}
catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}
//# sourceMappingURL=cli.js.map