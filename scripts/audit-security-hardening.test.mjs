/* eslint-disable no-template-curly-in-string */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { findUnpinned } from './check-action-pins.mjs'
import { findInjections } from './check-workflow-injection.mjs'
import {
  assertValidDistTag,
  assertValidPackageName,
  assertValidVersion,
  parseConfiguredCommand,
} from './publish-package.mjs'
import {
  assertValidVersion as assertSyncVersion,
  assertValidBranch,
  assertValidTag,
} from './version-sync.mjs'

const scriptsDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptsDir, '..')
const workflowsDir = path.join(repoRoot, '.github', 'workflows')
const tempDirs = []

function readWorkflow(name) {
  return parse(fs.readFileSync(path.join(workflowsDir, name), 'utf8'))
}

function makeTempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe('workflow security hardening', () => {
  it('restricts plugin-npm-publish registry input to an exact choice allowlist validated before setup-node', () => {
    const workflow = readWorkflow('plugin-npm-publish.yml')
    const registryInput = workflow.on.workflow_dispatch.inputs.registry
    expect(registryInput.type).toBe('choice')
    expect(registryInput.options).toEqual(['https://registry.npmjs.org'])
    expect(registryInput.default).toBe('https://registry.npmjs.org')

    const steps = workflow.jobs['publish-plugins'].steps
    const validateIndex = steps.findIndex(step => step.id === 'registry')
    const setupNodeIndex = steps.findIndex(step => step.uses?.startsWith('actions/setup-node@'))
    expect(validateIndex).toBeGreaterThan(-1)
    expect(setupNodeIndex).toBeGreaterThan(validateIndex)
    expect(steps[setupNodeIndex].with['registry-url']).toBe('${{ steps.registry.outputs.url }}')

    const publishStep = steps.find(step => step.name === 'Stage, Validate, and Publish Selected Plugins')
    expect(publishStep.env.INPUT_REGISTRY).toBe('${{ steps.registry.outputs.url }}')
  })

  it('restricts tuffex-docs-ci Cloudflare deploy to master and separates install --ignore-scripts from CF secrets', () => {
    const workflow = readWorkflow('tuffex-docs-ci.yml')
    const deployJob = workflow.jobs.deploy_cloudflare
    expect(String(deployJob.if)).toContain('github.ref == \'refs/heads/master\'')

    const uploadStep = workflow.jobs.tuffex_docs_ci.steps.find(step => step.name === 'Upload staged Cloudflare assets')
    expect(String(uploadStep.if)).toContain('github.ref == \'refs/heads/master\'')

    const installIndex = deployJob.steps.findIndex(step =>
      typeof step.run === 'string' && step.run.includes('pnpm install --frozen-lockfile --ignore-scripts'),
    )
    const deployIndex = deployJob.steps.findIndex(step =>
      typeof step.run === 'string' && step.run.includes('wrangler deploy'),
    )
    expect(installIndex).toBeGreaterThan(-1)
    expect(deployIndex).toBeGreaterThan(installIndex)
    expect(deployJob.steps[installIndex].env).toBeUndefined()
    expect(deployJob.steps[deployIndex].run).not.toContain('pnpm install')
    expect(deployJob.steps[deployIndex].env?.CLOUDFLARE_API_TOKEN).toBe('${{ secrets.CLOUDFLARE_API_TOKEN }}')
  })

  it('scopes NEXUS_API_KEY solely to Sync Nexus update news and passes published_payload via env', () => {
    const workflow = readWorkflow('package-tuff-cli-publish.yml')
    expect(workflow.jobs.publish.env).toBeUndefined()

    const syncStep = workflow.jobs.publish.steps.find(step => step.name === 'Sync Nexus update news')
    expect(syncStep.env?.NEXUS_API_KEY).toBe('${{ secrets.NEXUS_API_KEY }}')
    expect(syncStep.env?.PUBLISHED_PAYLOAD).toBe('${{ steps.publish.outputs.published_payload }}')
    expect(syncStep.run).not.toContain('${{')
  })

  it('registers an EXIT cleanup trap immediately after mktemp in catalog-pack-sign.yml', () => {
    const workflow = readWorkflow('catalog-pack-sign.yml')
    const signStep = workflow.jobs.sign.steps.find(step => step.name === 'Sign the pack')
    const lines = signStep.run.split('\n').map(line => line.trim())
    const mktempIdx = lines.findIndex(line => line.includes('mktemp'))
    const trapIdx = lines.findIndex(line => line.startsWith('trap ') && line.includes('EXIT'))
    expect(mktempIdx).toBeGreaterThan(-1)
    expect(trapIdx).toBeGreaterThan(mktempIdx)
  })

  it('tightens tag regex and removes direct step-output interpolation in build-and-release.yml and ci.yml', () => {
    const releaseWorkflow = readWorkflow('build-and-release.yml')
    const syncJob = releaseWorkflow.jobs['sync-nexus-release']
    const validateTagStep = syncJob.steps.find(step => step.name === 'Validate sync tag')
    expect(validateTagStep.run).toContain('^v[0-9]+\\.[0-9]+\\.[0-9]+(-[0-9A-Za-z-]+(\\.[0-9A-Za-z-]+)*)?$')

    for (const stepName of [
      'Download and validate release manifest',
      'Resolve release notes payload',
      'Upsert Nexus release metadata',
    ]) {
      const step = syncJob.steps.find(entry => entry.name === stepName)
      expect(step?.run, stepName).not.toContain('${{')
    }

    const createReleaseNotes = releaseWorkflow.jobs['create-release'].steps.find(
      step => step.name === 'Generate Release Notes',
    )
    expect(createReleaseNotes?.run).not.toContain('${{')

    const ciWorkflow = readWorkflow('ci.yml')
    const failLockfileStep = ciWorkflow.jobs.job1.steps.find(step => step.name === 'Fail on foreign lockfile changes')
    expect(failLockfileStep?.env?.CHANGE_FILES).toBe('${{ steps.filter_not_allowed.outputs.change_files }}')
    expect(failLockfileStep?.run).not.toContain('${{')
  })
})

describe('static guard & release script hardening', () => {
  it('blocks path traversal, shell metacharacter injection, and unknown-permission pass logs in validate-plugins.mjs', () => {
    const root = makeTempDir('tuff-validate-plugins-sec-')
    const outsideScript = path.join(root, 'outside.js')
    fs.writeFileSync(outsideScript, 'module.exports = {}\n')

    const pluginsRoot = path.join(root, 'plugins')
    const traversalPlugin = path.join(pluginsRoot, 'bad-traversal')
    fs.mkdirSync(traversalPlugin, { recursive: true })
    fs.writeFileSync(path.join(traversalPlugin, 'manifest.json'), JSON.stringify({
      id: 'com.test.traversal',
      name: 'bad-traversal',
      version: '1.0.0',
      main: '../../outside.js',
    }))

    const sentinelPath = path.join(root, 'pwned-sentinel')
    const metaPlugin = path.join(pluginsRoot, 'safe-metachar')
    fs.mkdirSync(metaPlugin, { recursive: true })
    const trickyEntry = '$(touch pwned-sentinel).js'
    fs.writeFileSync(path.join(metaPlugin, trickyEntry), 'const ok = 1;\n')
    fs.writeFileSync(path.join(metaPlugin, 'manifest.json'), JSON.stringify({
      id: 'com.test.metachar',
      name: 'safe-metachar',
      version: '1.0.0',
      main: trickyEntry,
    }))

    const unknownPermPlugin = path.join(pluginsRoot, 'bad-perm')
    fs.mkdirSync(unknownPermPlugin, { recursive: true })
    fs.writeFileSync(path.join(unknownPermPlugin, 'index.js'), 'module.exports = {}\n')
    fs.writeFileSync(path.join(unknownPermPlugin, 'manifest.json'), JSON.stringify({
      id: 'com.test.perm',
      name: 'bad-perm',
      version: '1.0.0',
      permissions: ['not.a.real.permission'],
    }))

    let stdout = ''
    let stderr = ''
    let exitCode = 0
    try {
      stdout = execFileSync(process.execPath, [path.join(scriptsDir, 'validate-plugins.mjs')], {
        cwd: root,
        env: { ...process.env, TUFF_PLUGINS_DIR: pluginsRoot },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }
    catch (error) {
      exitCode = error.status ?? 1
      stdout = String(error.stdout ?? '')
      stderr = String(error.stderr ?? '')
    }

    expect(exitCode).toBe(1)
    expect(fs.existsSync(sentinelPath)).toBe(false)
    expect(stderr).toContain('resolves outside plugin directory')
    expect(stderr).toContain('Unknown permission IDs: not.a.real.permission')
    expect(stdout).not.toContain('[bad-perm] OK')
    expect(stdout).toContain('[safe-metachar] OK')
  })

  it('removes execSync and shell:true from version-sync.mjs and publish-package.mjs and validates inputs strictly', () => {
    const versionSyncSource = fs.readFileSync(path.join(scriptsDir, 'version-sync.mjs'), 'utf8')
    const publishPackageSource = fs.readFileSync(path.join(scriptsDir, 'publish-package.mjs'), 'utf8')
    expect(versionSyncSource).not.toContain('execSync')
    expect(versionSyncSource).not.toMatch(/shell\s*:\s*true/)
    expect(publishPackageSource).not.toContain('execSync')
    expect(publishPackageSource).not.toMatch(/shell\s*:\s*true/)

    expect(assertSyncVersion('2.4.15-beta.15')).toBe('2.4.15-beta.15')
    assert.throws(() => assertSyncVersion('2.4.15;rm -rf /'))
    expect(assertValidTag('v2.4.15-beta.1')).toBe('v2.4.15-beta.1')
    assert.throws(() => assertValidTag('v2.4.15$(id)'))
    expect(assertValidBranch('task/fix/audit-plugins-scripts-ci')).toBe('task/fix/audit-plugins-scripts-ci')
    assert.throws(() => assertValidBranch('-evil'))
    assert.throws(() => assertValidBranch('main;whoami'))

    expect(assertValidVersion('1.2.3-next.0')).toBe('1.2.3-next.0')
    assert.throws(() => assertValidVersion('1.2.3" && id'))
    expect(assertValidDistTag('next')).toBe('next')
    assert.throws(() => assertValidDistTag('--registry=https://evil.example'))
    expect(assertValidPackageName('@talex-touch/tuffex')).toBe('@talex-touch/tuffex')
    assert.throws(() => assertValidPackageName('@talex-touch/tuffex;id'))
    expect(parseConfiguredCommand('pnpm --filter "@talex-touch/tuffex" run build')).toEqual({
      bin: 'pnpm',
      args: ['--filter', '@talex-touch/tuffex', 'run', 'build'],
    })
    assert.throws(() => parseConfiguredCommand('pnpm build && curl evil'))
  })

  it('catches github-script, expanded attacker contexts, quoted uses, docker:// refs, prototype keys, and symlink invocations', () => {
    const injections = findInjections(['x.yml'], () => [
      '      - uses: actions/github-script@v7',
      '        with:',
      '          script: |',
      '            const ref = "${{ github.event.pull_request.head.ref }}"',
      '      - run: echo "${{ github.event.discussion.body }}"',
    ].join('\n'))
    expect(injections).toHaveLength(2)

    const unpinned = findUnpinned(['x.yml'], () => [
      '      - uses: \'pnpm/action-setup@v6\'',
      '      - uses: "owner/tool@main"',
      '      - uses: docker://alpine:3.18',
      '      - uses: constructor/action@v1',
      '      - uses: docker://alpine@sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    ].join('\n'))
    expect(unpinned).toHaveLength(4)

    const linkDir = makeTempDir('tuff-symlink-check-')
    const injLink = path.join(linkDir, 'check-workflow-injection.mjs')
    const stageLink = path.join(linkDir, 'stage-herdr-core-binary.mjs')
    fs.symlinkSync(path.join(scriptsDir, 'check-workflow-injection.mjs'), injLink)
    fs.symlinkSync(path.join(scriptsDir, 'stage-herdr-core-binary.mjs'), stageLink)

    const injOut = execFileSync(process.execPath, [injLink], { encoding: 'utf8' })
    expect(injOut).toContain('[workflow-injection]')
    const stageOut = execFileSync(process.execPath, [stageLink, '--help'], { encoding: 'utf8' })
    expect(stageOut).toContain('Usage: node scripts/stage-herdr-core-binary.mjs')
  })
})
