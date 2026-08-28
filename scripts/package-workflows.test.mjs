import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { publishPackages } from './package-publish.config.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_ROOT = path.join(ROOT, '.github', 'workflows')

function readWorkflow(fileName) {
  return parse(readFileSync(path.join(WORKFLOW_ROOT, fileName), 'utf8'))
}

function workflowPaths(workflow, eventName) {
  return workflow.on?.[eventName]?.paths ?? []
}

function runSteps(workflow, jobName) {
  return (workflow.jobs?.[jobName]?.steps ?? []).filter(step => typeof step.run === 'string')
}

function commandText(workflow, jobName) {
  return runSteps(workflow, jobName).map(step => step.run).join('\n')
}

function missingPaths(workflow, eventName, requiredPaths) {
  const configured = new Set(workflowPaths(workflow, eventName))
  return requiredPaths.filter(requiredPath => !configured.has(requiredPath))
}

function missingPrePublishCommands(workflow, jobName, publishCommand, requiredCommands) {
  const steps = runSteps(workflow, jobName)
  const publishIndex = steps.findIndex(step => step.run.includes(publishCommand))

  if (publishIndex < 0) {
    return requiredCommands
  }

  return requiredCommands.filter((command) => {
    const gateIndex = steps.findIndex(step => step.run.includes(command))
    return gateIndex < 0 || gateIndex >= publishIndex
  })
}

function shellCommandLines(script) {
  return script.split('\n').map(line => line.trim()).filter(Boolean)
}

function missingOrderedCommands(script, requiredCommands) {
  const lines = shellCommandLines(script)
  let cursor = -1

  return requiredCommands.filter((command) => {
    const index = lines.indexOf(command, cursor + 1)
    if (index < 0)
      return true

    cursor = index
    return false
  })
}

function enclosingIfConditions(script, command) {
  const conditions = []

  for (const line of shellCommandLines(script)) {
    if (/^if\b.*; then$/.test(line)) {
      conditions.push(line)
      continue
    }
    if (line === 'fi') {
      conditions.pop()
      continue
    }
    if (line === command)
      return [...conditions]
  }

  return null
}

function tuffCliCiTestGateFindings(workflow) {
  const input = workflow.jobs?.cli?.with ?? {}
  const findings = []
  const requiredCommands = [
    'pnpm --dir ../.. --filter "@talex-touch/tuff-cli-core" run build',
    'pnpm --dir ../.. --filter "@talex-touch/unplugin-export-plugin" run build',
    'pnpm test',
  ]

  if (input['run-test'] !== true)
    findings.push('tuff-cli CI test gate is disabled')

  for (const command of missingOrderedCommands(String(input['test-command'] ?? ''), requiredCommands))
    findings.push(`tuff-cli CI test gate is missing or misorders: ${command}`)

  return findings
}

function tuffCliPublishTestGateFindings(workflow) {
  const script = workflow.jobs?.publish?.steps?.find(step => step.id === 'publish')?.run ?? ''
  const testCommand = 'pnpm --filter "@talex-touch/tuff-cli" run test'
  const shellPackage = '$' + '{package}'
  const cliCondition = `if [ "${shellPackage}" = "@talex-touch/tuff-cli" ]; then`
  const requiredCommands = [
    'pnpm --filter "@talex-touch/tuff-cli-core" run build',
    'pnpm --filter "@talex-touch/unplugin-export-plugin" run build',
    testCommand,
  ]
  const findings = missingOrderedCommands(script, requiredCommands)
    .map(command => `tuff-cli publish gate is missing or misorders: ${command}`)
  const testConditions = enclosingIfConditions(script, testCommand)

  if (!testConditions?.includes(cliCondition))
    findings.push('tuff-cli publish test is not scoped to the tuff-cli package')

  return findings
}

const CI_WORKFLOWS = [
  {
    file: 'package-intelligence-uikit-ci.yml',
    paths: [
      'packages/intelligence-uikit/**',
      'packages/tuff-intelligence/**',
      'packages/tuffex/**',
      'packages/utils/**',
    ],
  },
  {
    file: 'package-pi-extension-ci.yml',
    paths: ['packages/pi-extension-tuff/**'],
  },
  {
    file: 'package-tuff-cli-ci.yml',
    paths: [
      'packages/tuff-cli/**',
      'packages/tuff-cli-core/**',
      'packages/unplugin-export-plugin/**',
      'packages/utils/**',
    ],
  },
  {
    file: 'package-tuff-core-ci.yml',
    paths: ['packages/tuff-core/**'],
  },
  {
    file: 'package-tuff-intelligence-ci.yml',
    paths: ['packages/tuff-intelligence/**', 'packages/utils/**'],
  },
  {
    file: 'package-tuffex-ci.yml',
    paths: ['packages/tuffex/**', 'packages/utils/**'],
  },
  {
    file: 'package-unplugin-ci.yml',
    paths: ['packages/unplugin-export-plugin/**'],
  },
  {
    file: 'package-utils-ci.yml',
    paths: ['packages/utils/**'],
  },
]

const PACKAGE_GATES = [
  {
    file: 'package-intelligence-uikit-ci.yml',
    job: 'ci',
    expected: { 'run-typecheck': true, 'run-lint': true, 'run-test': true },
  },
  {
    file: 'package-pi-extension-ci.yml',
    job: 'ci',
    expected: { 'run-test': true },
  },
  {
    file: 'package-tuff-cli-ci.yml',
    job: 'core',
    expected: { 'run-lint': true, 'run-test': true, 'run-build': true },
  },
  {
    file: 'package-tuff-cli-ci.yml',
    job: 'cli',
    expected: { 'run-lint': true, 'run-test': true, 'run-build': true },
  },
  {
    file: 'package-tuff-core-ci.yml',
    job: 'ci',
    expected: { 'run-lint': true, 'run-build': true },
  },
  {
    file: 'package-tuff-intelligence-ci.yml',
    job: 'ci',
    expected: { 'run-lint': true, 'run-test': true, 'run-build': true },
  },
  {
    file: 'package-tuffex-ci.yml',
    job: 'ci',
    expected: {
      'run-typecheck': true,
      'run-lint': true,
      'run-test': true,
      'run-build': true,
    },
  },
  {
    file: 'package-unplugin-ci.yml',
    job: 'ci',
    expected: { 'run-lint': true, 'run-test': true, 'run-build': true },
  },
  {
    file: 'package-utils-ci.yml',
    job: 'ci',
    expected: { 'run-lint': true, 'run-test': true, 'run-build': true },
  },
]

const PUBLISH_WORKFLOWS = [
  {
    file: 'package-tuffex-publish.yml',
    paths: ['packages/tuffex/**'],
  },
  {
    file: 'package-utils-publish.yml',
    paths: ['packages/utils/**'],
  },
  {
    file: 'package-tuff-intelligence-publish.yml',
    paths: ['packages/tuff-intelligence/**', 'packages/utils/**'],
  },
  {
    file: 'package-tuff-cli-publish.yml',
    paths: [
      'packages/tuff-cli/package.json',
      'packages/tuff-cli/src/**',
      'packages/tuff-cli/tsup.config.ts',
      'packages/tuff-cli-core/package.json',
      'packages/tuff-cli-core/src/**',
      'packages/tuff-cli-core/tsup.config.ts',
      'packages/tuff-core/package.json',
      'packages/tuff-core/src/**',
      'packages/unplugin-export-plugin/package.json',
      'packages/unplugin-export-plugin/src/**',
      'packages/unplugin-export-plugin/tsup.config.ts',
    ],
  },
]

describe('package CI workflow contracts', () => {
  it.each(CI_WORKFLOWS)('$file tracks package inputs on pull requests and pushes', ({ file, paths }) => {
    const workflow = readWorkflow(file)
    const common = [
      ...paths,
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      `.github/workflows/${file}`,
      '.github/workflows/package-ci.yml',
    ]

    for (const eventName of ['pull_request', 'push']) {
      expect(
        missingPaths(workflow, eventName, common),
        `${file} ${eventName} does not follow its package/dependency inputs`,
      ).toEqual([])
    }
  })

  it.each(PACKAGE_GATES)('$file:$job enables every declared package gate', ({ file, job, expected }) => {
    const workflow = readWorkflow(file)
    const packageJob = workflow.jobs?.[job]

    expect(packageJob?.uses).toBe('./.github/workflows/package-ci.yml')
    for (const [input, value] of Object.entries(expected)) {
      expect(packageJob.with?.[input], `${file}:${job} must set ${input}=${value}`).toBe(value)
    }
  })

  it('treats a missing build output as a failed reusable job', () => {
    const workflow = readWorkflow('package-ci.yml')
    const upload = workflow.jobs.ci.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'))

    expect(upload).toBeDefined()
    expect(upload.with?.['if-no-files-found']).toBe('error')
  })

  it('builds the complete Utils public surface and declarations in its dedicated CI', () => {
    const workflow = readWorkflow('package-utils-ci.yml')
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'packages/utils/package.json'), 'utf8'))
    const exports = Object.values(manifest.publishConfig?.exports ?? {})
      .flatMap(entry => typeof entry === 'string' ? [entry] : Object.values(entry))

    expect(workflow.jobs.ci.with['run-build']).toBe(true)
    expect(workflow.jobs.ci.with['build-command']).toBe('pnpm build')
    expect(workflow.jobs.ci.with['test-command']).toContain('--exclude "**/*.benchmark.test.ts"')
    expect(workflow.jobs.ci.with['test-command']).toContain('pnpm benchmark:preview')
    expect(manifest.scripts.build).toContain('--dts')
    expect(exports.length).toBeGreaterThan(20)
    expect(exports.every(target => target === './package.json' || target.startsWith('./dist/'))).toBe(true)
  })

  it('runs Tuff Intelligence tests with a non-default pack-test timeout', () => {
    const workflow = readWorkflow('package-tuff-intelligence-ci.yml')
    const input = workflow.jobs.ci.with

    expect(input['run-test']).toBe(true)
    expect(input['test-command']).toContain('vitest run')
    expect(input['test-command']).toContain('--testTimeout 120000')
  })

  it('runs tuff-cli tests after building their workspace runtime dependencies', () => {
    const workflow = readWorkflow('package-tuff-cli-ci.yml')

    expect(tuffCliCiTestGateFindings(workflow)).toEqual([])
  })

  it('has a negative control for missing trigger and gate coverage', () => {
    const workflow = readWorkflow('package-utils-ci.yml')
    const broken = structuredClone(workflow)
    broken.on.push.paths = broken.on.push.paths.filter(value => value !== 'packages/utils/**')
    broken.jobs.ci.with['run-build'] = false

    expect(missingPaths(broken, 'push', ['packages/utils/**'])).toEqual(['packages/utils/**'])
    expect(broken.jobs.ci.with['run-build']).not.toBe(true)
  })
})

describe('package publish workflow contracts', () => {
  it.each(PUBLISH_WORKFLOWS)('$file tracks every build and publish input', ({ file, paths }) => {
    const workflow = readWorkflow(file)
    const requiredPaths = [
      ...paths,
      'pnpm-lock.yaml',
      'pnpm-workspace.yaml',
      'scripts/package-publish.config.mjs',
      'scripts/validate-publish-manifests.mjs',
      'scripts/publish-package.mjs',
      `.github/workflows/${file}`,
    ]

    expect(missingPaths(workflow, 'push', requiredPaths)).toEqual([])
  })

  it.each([
    {
      file: 'package-tuffex-publish.yml',
      packageName: '@talex-touch/tuffex',
      gateCommands: [
        'pnpm -C "packages/tuffex" test',
        'pnpm -C "packages/tuffex" lint',
        'pnpm -C "packages/tuffex" typecheck',
        'pnpm build',
        'pnpm -C "packages/tuffex" audit:exports',
        'pnpm -C "packages/tuffex" audit:readme',
        'pnpm -C "packages/tuffex" audit:types',
        'pnpm -C "packages/tuffex" audit:size',
      ],
      waitsForUtils: true,
    },
    {
      file: 'package-utils-publish.yml',
      packageName: '@talex-touch/utils',
      gateCommands: [
        'pnpm -C "packages/utils" exec vitest run',
        'pnpm -C "packages/utils" benchmark:preview',
        'pnpm -C "packages/utils" lint',
        'pnpm -C "packages/utils" build',
      ],
      waitsForUtils: false,
    },
    {
      file: 'package-tuff-intelligence-publish.yml',
      packageName: '@talex-touch/tuff-intelligence',
      gateCommands: [
        'pnpm -C "packages/tuff-intelligence" lint',
        'pnpm -C "packages/tuff-intelligence" exec vitest run',
        'pnpm build',
      ],
      waitsForUtils: true,
    },
  ])('$file gates and packs $packageName before npm publication', ({ file, packageName, gateCommands, waitsForUtils }) => {
    const workflow = readWorkflow(file)
    const text = commandText(workflow, 'publish')
    const publishCommand = `scripts/publish-package.mjs --filter "${packageName}"`
    const publishStep = runSteps(workflow, 'publish').find(step => step.run.includes(publishCommand))

    expect(publishStep?.run).toContain(`--filter "${packageName}"`)
    expect(publishStep?.run).toContain('--skip-build')
    expect(missingPrePublishCommands(workflow, 'publish', publishCommand, gateCommands)).toEqual([])

    if (waitsForUtils) {
      const explicitWait = text.includes('Waiting for @talex-touch/utils@')
      const configuredPackage = publishPackages.find(packageInfo => packageInfo.name === packageName)
      const configuredWait = configuredPackage?.waitForPackages?.includes('@talex-touch/utils')
      expect(explicitWait || configuredWait).toBe(true)
    }
  })

  it('rejects a publish workflow whose real build gate is missing', () => {
    const workflow = readWorkflow('package-utils-publish.yml')
    const broken = structuredClone(workflow)
    broken.jobs.publish.steps = broken.jobs.publish.steps.filter(
      step => step.name !== 'Build and type-check utils package',
    )

    expect(missingPrePublishCommands(
      broken,
      'publish',
      'scripts/publish-package.mjs --filter "@talex-touch/utils"',
      ['pnpm -C "packages/utils" build'],
    )).toEqual(['pnpm -C "packages/utils" build'])
  })

  it('validates every CLI tarball and waits for Utils only for the package that declares it', () => {
    const workflow = readWorkflow('package-tuff-cli-publish.yml')
    const script = workflow.jobs.publish.steps.find(step => step.id === 'publish')?.run ?? ''
    const shellPackage = '$' + '{package}'
    const lintCommand = `pnpm --filter "${shellPackage}" run lint`
    const buildCommand = `pnpm --filter "${shellPackage}" run build`
    const packCommand = `node scripts/validate-publish-manifests.mjs --filter "${shellPackage}" --pack`
    const publishCommand = `pnpm --filter "${shellPackage}" publish --access public`
    const cliBranch = `if [ "${shellPackage}" = "@talex-touch/tuff-cli" ]; then`
    const cliGateStart = script.indexOf(cliBranch)
    const cliBuildStart = script.indexOf(cliBranch, cliGateStart + cliBranch.length)
    const cliGateBlock = script.slice(cliGateStart, cliBuildStart)

    for (const packageName of [
      '@talex-touch/tuff-core',
      '@talex-touch/unplugin-export-plugin',
      '@talex-touch/tuff-cli',
    ]) {
      expect(script).toContain(`"${packageName}"`)
    }
    for (const command of [lintCommand, buildCommand, packCommand, publishCommand]) {
      expect(script).toContain(command)
    }
    for (const command of [
      'pnpm --filter "@talex-touch/tuff-cli-core" run lint',
      'pnpm --filter "@talex-touch/tuff-cli-core" run test',
      'pnpm --filter "@talex-touch/unplugin-export-plugin" run lint',
      'pnpm --filter "@talex-touch/unplugin-export-plugin" run test',
    ]) {
      expect(cliGateBlock).toContain(command)
    }
    expect(script.indexOf(lintCommand)).toBeLessThan(script.indexOf(buildCommand))
    expect(script.indexOf(buildCommand)).toBeLessThan(script.indexOf(packCommand))
    expect(script.indexOf(packCommand)).toBeLessThan(script.indexOf(publishCommand))
    expect(script.match(/utils_version=/g)).toHaveLength(1)
    expect(cliGateBlock).toContain('utils_version=')
    expect(script).toContain('dist_tag="latest"')
    expect(script).toContain('dist_tag="next"')
  })

  it('runs tuff-cli own tests before publishing it', () => {
    const workflow = readWorkflow('package-tuff-cli-publish.yml')

    expect(tuffCliPublishTestGateFindings(workflow)).toEqual([])
  })

  it('rejects tuff-cli CI and publish workflows that skip their own tests', () => {
    const ciWorkflow = readWorkflow('package-tuff-cli-ci.yml')
    const brokenCi = structuredClone(ciWorkflow)
    brokenCi.jobs.cli.with['run-test'] = false

    expect(tuffCliCiTestGateFindings(brokenCi)).toContain('tuff-cli CI test gate is disabled')

    const publishWorkflow = readWorkflow('package-tuff-cli-publish.yml')
    const brokenPublish = structuredClone(publishWorkflow)
    const publishStep = brokenPublish.jobs.publish.steps.find(step => step.id === 'publish')
    publishStep.run = publishStep.run.replace(
      'pnpm --filter "@talex-touch/tuff-cli" run test',
      'echo "tuff-cli tests skipped"',
    )

    expect(tuffCliPublishTestGateFindings(brokenPublish)).toContain(
      'tuff-cli publish gate is missing or misorders: pnpm --filter "@talex-touch/tuff-cli" run test',
    )
  })
})
