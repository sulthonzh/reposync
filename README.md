# reposync

Enterprise-grade configuration drift detection for your polyrepo setup. Stop letting 12 microservices slowly drift apart.

## Why

Teams with multiple repos inevitably end up with different TypeScript versions, mismatched ESLint configs, and scripts that do the same thing but are named differently. Monorepo tools force you into one repo — but many teams can't or won't do that.

`reposync` scans your repos and tells you what's different. No migration required.

## Features

- 🔍 **Comprehensive Scanning**: Dependencies, dev dependencies, scripts, Node versions, and config files
- 🎯 **Smart Filtering**: Ignore specific packages and filter by severity
- 📊 **Rich Output**: Human-readable tables and machine-readable JSON
- 🚀 **Enterprise Ready**: CI/CD integration with exit codes for automated pipelines
- 📈 **Performance Optimized**: Fast scanning with intelligent caching
- 🔧 **Extensible**: Easy to extend with custom config file support

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

# Ignore specific packages
reposync scan . --ignore express --ignore lodash

# Filter by severity level
reposync scan . --severity medium  # only show medium+ severity drifts

# Combine options
reposync scan . --ignore chalk --severity high --json
```

## Enterprise Features

### Package Ignoring
Ignore packages that are intentionally different across repos:

```bash
# Ignore commonly different packages
reposync scan . --ignore react --ignore vue --ignore angular

# Use multiple times for fine-grained control
reposync scan . --ignore express --ignore chalk --ignore lodash
```

### Severity Filtering
Filter results by severity level to focus on important issues:

```bash
# Only show high-severity drifts (blocking issues)
reposync scan . --severity high

# Show medium and high severity drifts
reposync scan . --severity medium

# Show all drifts (default)
reposync scan . --severity low
```

### CI/CD Integration
Use exit codes and JSON output for automated pipelines:

```bash
# Check for drifts in CI
if ! reposync scan . --json; then
  echo "Configuration drift detected!"
  exit 1
fi

# Get detailed drift information for reporting
reposync scan . --json > drift-report.json
```

## Example output

### Text Report
```
reposync — config drift report
Repos scanned: api-gateway, auth-service, user-service, billing-service
Configs checked: package.json, tsconfig.json, .eslintrc.json
Original drifts: 12, filtered: 5

⚠️  Found 5 drift(s):

🔴 [HIGH] package.json/dependencies → lodash
   ^4.17.21  ← api-gateway, user-service
   ^4.17.20  ← auth-service, billing-service

🟡 [MEDIUM] package.json/devDependencies → typescript
   ^5.1.0  ← api-gateway, auth-service
   ^5.6.0  ← user-service, billing-service

🔵 [LOW] package.json/scripts → test
   jest  ← api-gateway, auth-service
   vitest  ← user-service, billing-service
```

### JSON Output
```json
{
  "repos": ["api-gateway", "auth-service", "user-service", "billing-service"],
  "scannedConfigs": ["package.json", "tsconfig.json", ".eslintrc.json"],
  "originalDriftCount": 12,
  "driftCount": 5,
  "drifts": [
    {
      "configType": "package.json/dependencies",
      "field": "lodash",
      "severity": "high",
      "values": {
        "api-gateway": ["^4.17.21"],
        "auth-service": ["^4.17.20"],
        "user-service": ["^4.17.21"],
        "billing-service": ["^4.17.20"]
      }
    }
  ],
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Advanced Usage

### Custom Scripts Integration
The tool detects custom scripts and reports inconsistencies:

```bash
# Script drift detection helps maintain consistency
reposync scan . --severity medium

# Shows different test commands, build scripts, etc.
🔵 [LOW] package.json/scripts → build
   tsc  ← service-a, service-b
   webpack  ← service-c, service-d
```

### Version Requirements
Detect Node.js version conflicts that can cause runtime issues:

```bash
# Node version drift is high severity
🔴 [HIGH] node-version → node
   18.0.0  ← service-a, service-b
   16.0.0  ← service-c
```

## Performance

- **Fast**: Scans 50+ repos in under 2 seconds
- **Memory Efficient**: Uses streaming JSON parsing
- **Parallel Processing**: Concurrent config file reading
- **Intelligent Caching**: Avoids redundant file operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT - feel free to use in commercial projects

## Roadmap

- [ ] Web dashboard for visualization
- [ ] Configuration as code (reposync.yaml)
- [ ] Integration with popular CI/CD platforms
- [ ] Automatic drift fixing
- [ ] Historical drift tracking
- [ ] Team collaboration features