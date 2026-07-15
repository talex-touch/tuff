#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const mode = process.argv[2] || 'verify'
const root = process.cwd()
const workflowPath = '.github/workflows/intelligence.yml'

const diffCheckPaths = [
  'mise.toml',
  workflowPath,
  'scripts/intelligence',
  'packages/tuff-intelligence/src',
  'apps/core-app/src/main/modules/ai',
  'apps/nexus/server/utils',
  'docs/plan-prd/TODO.md',
  'docs/plan-prd/01-project/CHANGES.md',
]

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function runParallel(groups) {
  const results = groups.map(([command, args]) => spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  }))

  for (const result of results) {
    if (result.stdout)
      process.stdout.write(result.stdout)
    if (result.stderr)
      process.stderr.write(result.stderr)
  }

  const failed = results.find(result => result.status !== 0)
  if (failed)
    process.exit(failed.status ?? 1)
}

function dev() {
  runParallel([
    ['pnpm', ['-C', 'packages/tuff-intelligence', 'exec', 'vitest', 'run', 'src/resolvers/intelligence-resolvers.test.ts']],
    ['pnpm', ['-C', 'apps/nexus', 'exec', 'vitest', 'run', 'server/utils/intelligenceProviderRegistryBridge.test.ts', 'server/utils/tuffIntelligenceLabService.invoke.test.ts', 'server/utils/tuffIntelligenceAbilityAggregation.test.ts', 'server/utils/tuffIntelligenceProviderAdapters.test.ts', 'server/utils/__tests__/intelligence-agent-runtime-bridge.test.ts']],
    ['pnpm', ['-C', 'apps/core-app', 'exec', 'vitest', 'run', 'src/main/modules/ai/intelligence-config.test.ts', 'src/main/modules/ai/intelligence-sdk.test.ts', 'src/main/modules/ai/intelligence-shared-resolver-contract.test.ts']],
  ])
}

function changed() {
  run('git', ['diff', '--check', '--', ...diffCheckPaths])
  dev()
}

function release() {
  run('pnpm', ['-C', 'packages/tuff-intelligence', 'exec', 'tsc', '--noEmit'])
  run('pnpm', ['-C', 'apps/nexus', 'exec', 'vitest', 'run', 'server/utils/intelligenceProviderRegistryBridge.test.ts', 'server/utils/tuffIntelligenceLabService.invoke.test.ts', 'server/utils/tuffIntelligenceAbilityAggregation.test.ts', 'server/utils/tuffIntelligenceProviderAdapters.test.ts', 'server/utils/__tests__/intelligence-agent-graph-runner.test.ts', 'server/utils/__tests__/intelligence-agent-runtime-bridge.test.ts'])
  run('pnpm', ['-C', 'apps/core-app', 'exec', 'vitest', 'run', 'src/main/modules/ai/intelligence-config.test.ts', 'src/main/modules/ai/intelligence-sdk.test.ts', 'src/main/modules/ai/intelligence-shared-resolver-contract.test.ts'])
}

function parity() {
  if (!existsSync(workflowPath)) {
    throw new Error(`${workflowPath} is missing`)
  }
  const workflow = readFileSync(workflowPath, 'utf8')
  if (!workflow.includes('mise run intelligence:verify')) {
    throw new Error(`${workflowPath} must run mise run intelligence:verify`)
  }
  console.log('intelligence parity ok: GitHub workflow runs mise run intelligence:verify')
}

if (mode === 'dev') {
  dev()
}
else if (mode === 'changed') {
  changed()
}
else if (mode === 'release') {
  release()
}
else if (mode === 'parity') {
  parity()
}
else if (mode === 'verify') {
  changed()
  release()
  parity()
}
else {
  throw new Error(`Unknown intelligence verify mode: ${mode}`)
}

console.log(`intelligence:${mode} ok`)
