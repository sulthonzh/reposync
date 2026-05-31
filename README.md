# reposync

Detect config drift across your polyrepo setup. Stop letting 12 microservices slowly drift apart.

## Why

Teams with multiple repos inevitably end up with different TypeScript versions, mismatched ESLint configs, and scripts that do the same thing but are named differently. Monorepo tools force you into one repo — but many teams can't or won't do that.

`reposync` scans your repos and tells you what's different. No migration required.

## What it checks

- **Dependencies** — different versions of the same package across repos
- **Dev dependencies** — TypeScript, ESLint, testing frameworks out of sync
- **Scripts** — same script name, different implementation
- **Node version** — `.node-version`, `.nvmrc`, `engines.node`
- **Config files** — `tsconfig.json`, `.eslintrc.json`, `.prettierrc`, etc.
- **Engines** — runtime version requirements in package.json

## Install

```bash
npm install -g reposync
```

## Usage

```bash
# Scan all repos in a directory
reposync scan ~/projects

# Scan current directory
reposync scan .

# JSON output (for CI/CD)
reposync scan ~/projects --json

# List repos found
reposync list ~/projects

# Deeper search
reposync scan ~/projects --depth 2
```

## Example output

```
reposync — config drift report
Repos scanned: api-gateway, auth-service, user-service, billing-service
Configs checked: package.json, tsconfig.json, .eslintrc.json

⚠️  Found 5 drift(s):

🔴 [HIGH] package.json/dependencies → lodash
   ^4.17.21  ← api-gateway, user-service
   ^4.17.20  ← auth-service, billing-service

🔴 [HIGH] node-version → node
   18.0.0  ← api-gateway, auth-service
   20.0.0  ← user-service

🟡 [MEDIUM] package.json/devDependencies → typescript
   ^5.1.0  ← api-gateway, auth-service
   ^5.6.0  ← user-service, billing-service

🟡 [MEDIUM] package.json/devDependencies → eslint
   ^8.0.0  ← api-gateway
   ^9.0.0  ← auth-service, user-service

🔵 [LOW] package.json/scripts → test
   jest  ← api-gateway, auth-service
   vitest  ← user-service, billing-service
```

## CI integration

```bash
reposync scan . --json
# Exit code 1 if drift found, 0 if clean
```

Pipe JSON output to your favorite tool, or just use the exit code to fail your pipeline.

## Zero dependencies

No runtime dependencies. Just Node.js 18+.

## License

MIT
