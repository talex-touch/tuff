import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/build-and-release.yml')
const workflow = parse(readFileSync(WORKFLOW_PATH, 'utf8'))

const QUALITY_JOB = 'release-quality'
const RELEASE_REF = [
  '$',
  '{{ github.event_name == \'workflow_dispatch\'',
  ' && github.event.inputs.sync_tag != \'\'',
  ' && github.event.inputs.sync_tag || github.sha }}',
].join('')
const GATED_SHA_REF = ['$', '{{ needs.release-quality.outputs.sha }}'].join('')
const RESOLVED_SHA_OUTPUT = ['$', '{{ steps.release-sha.outputs.sha }}'].join('')

function needsOf(job) {
  if (Array.isArray(job.needs))
    return job.needs
  return job.needs ? [job.needs] : []
}

function runStepsOf(job) {
  return (job.steps ?? []).filter(step => typeof step.run === 'string')
}

describe('build-and-release same-SHA quality gate', () => {
  it('reads the release workflow and its tag/manual entry points', () => {
    expect(workflow.name).toBe('Build and Release')
    expect(workflow.on.workflow_dispatch).toBeDefined()
    expect(workflow.on.push.tags).toContain('v*.*.*')
    expect(workflow.jobs['build-and-release']).toBeDefined()
    expect(workflow.jobs['create-release']).toBeDefined()
  })

  it('runs the canonical release quality command against the release target', () => {
    const quality = workflow.jobs[QUALITY_JOB]
    expect(quality, `${QUALITY_JOB} must gate every release path`).toBeDefined()
    expect(quality.if, 'the quality gate must run for tag and every manual mode').toBeUndefined()
    expect(quality['continue-on-error']).not.toBe(true)
    expect(quality.outputs?.sha).toBe(RESOLVED_SHA_OUTPUT)

    const checkout = quality.steps.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout, 'the quality gate must check out the release target').toBeDefined()
    expect(checkout.with?.ref).toBe(RELEASE_REF)
    expect(checkout.with?.['fetch-depth']).toBe(0)

    const resolveSha = quality.steps.find(step => step.id === 'release-sha')
    expect(resolveSha?.run).toContain('git rev-parse HEAD')
    expect(resolveSha?.run).toContain('$GITHUB_OUTPUT')

    const releaseGate = runStepsOf(quality).find(step =>
      step.run.split(/\r?\n/).some(line => line.trim() === 'pnpm quality:release'),
    )
    expect(
      releaseGate,
      'the gate must execute the canonical root release quality script',
    ).toBeDefined()
    expect(releaseGate['continue-on-error']).not.toBe(true)
  })

  it.each([
    ['platform builds', 'build-and-release'],
    ['release creation and recovered artifacts', 'create-release'],
    ['Nexus sync, including sync-only manual runs', 'sync-nexus-release'],
  ])('makes %s wait for a successful same-SHA gate', (_label, jobName) => {
    const job = workflow.jobs[jobName]
    expect(needsOf(job), `${jobName} can bypass ${QUALITY_JOB}`).toContain(QUALITY_JOB)

    const condition = String(job.if ?? '')
    expect(condition).toContain(`needs.${QUALITY_JOB}.result == 'success'`)

    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'))
    expect(checkout, `${jobName} must check out the quality-gated commit`).toBeDefined()
    expect(checkout.with?.ref).toBe(GATED_SHA_REF)
  })

  it('keeps recovered-artifact release creation possible only after quality passes', () => {
    const createRelease = workflow.jobs['create-release']
    expect(needsOf(createRelease)).toContain('build-and-release')
    expect(String(createRelease.if)).toContain('github.event.inputs.recover_run_id != \'\'')
    expect(String(createRelease.if)).toContain('needs.release-quality.result == \'success\'')
  })

  it('extracts the AppImage without FUSE outside the launch timeout and smoke-tests the .deb AppArmor install (#213)', () => {
    const build = workflow.jobs['build-and-release']
    const launch = build.steps.find(step => step.name === 'Smoke: launch the packaged Linux app')
    expect(launch, 'the Linux packaged launch smoke must exist').toBeDefined()

    const commands = launch.run.replace(/^\s*#.*$/gm, '')
    const lines = commands.split(/\r?\n/).map(line => line.trim())
    const extractIndex = lines.findIndex(line => line.includes('"$APPIMAGE" --appimage-extract'))
    const appImageTimeoutIndex = lines.findIndex(line => line.includes('timeout --signal=TERM 45s'))
    const debTimeoutIndex = lines.findIndex(line => line.includes('timeout --signal=TERM 30s'))

    expect(extractIndex).toBeGreaterThan(-1)
    expect(appImageTimeoutIndex).toBeGreaterThan(extractIndex)
    expect(debTimeoutIndex).toBeGreaterThan(appImageTimeoutIndex)

    expect(commands).not.toContain('--appimage-extract-and-run')
    expect(lines[appImageTimeoutIndex]).toMatch(/^timeout --signal=TERM 45s xvfb-run /)
    expect(commands).toContain('"$APPIMAGE_EXTRACT_DIR/squashfs-root/AppRun" --disable-gpu')
    expect(commands).toContain('/etc/apparmor.d/tuff')
    expect(commands).toContain('/opt/tuff/tuff --disable-gpu')
  })

  it('aligns Electron cache env paths, caches them via actions/cache before install, and does not wipe them before build', () => {
    const build = workflow.jobs['build-and-release']
    expect(build.env?.ELECTRON_CACHE).toBeUndefined()
    expect(build.env?.ELECTRON_BUILDER_CACHE).toBeUndefined()

    const configIndex = build.steps.findIndex(step => step.name === 'Configure Electron Cache Paths')
    const cacheIndex = build.steps.findIndex(step => step.uses?.startsWith('actions/cache@'))
    const installIndex = build.steps.findIndex(step => step.name === 'Install Dependencies')
    expect(configIndex).toBeGreaterThan(-1)
    expect(cacheIndex).toBeGreaterThan(configIndex)
    expect(installIndex).toBeGreaterThan(cacheIndex)

    /* eslint-disable no-template-curly-in-string -- matching literal bash variable expansions in workflow YAML */
    const configStep = build.steps[configIndex]
    expect(configStep.run).toContain('ELECTRON_CACHE=${RUNNER_TEMP}/tuff-cache/electron')
    expect(configStep.run).toContain('ELECTRON_BUILDER_CACHE=${RUNNER_TEMP}/tuff-cache/electron-builder')

    const cacheStep = build.steps[cacheIndex]
    expect(String(cacheStep.with?.path ?? '')).toContain('runner.temp')
    expect(String(cacheStep.with?.path ?? '')).toContain('tuff-cache/electron')
    expect(String(cacheStep.with?.path ?? '')).toContain('tuff-cache/electron-builder')

    const prepareStep = build.steps.find(step => step.name === 'Prepare Build Environment')
    expect(prepareStep?.run).toContain('mkdir -p "${ELECTRON_CACHE}"')
    expect(prepareStep?.run).toContain('mkdir -p "${ELECTRON_BUILDER_CACHE}"')
    /* eslint-enable no-template-curly-in-string */

    const cleanStep = build.steps.find(step => step.name === 'Clean Previous Build Artifacts')
    const cleanCommands = String(cleanStep?.run ?? '').replace(/^\s*#.*$/gm, '')
    expect(cleanCommands).not.toContain('ELECTRON_CACHE')
    expect(cleanCommands).not.toContain('ELECTRON_BUILDER_CACHE')
    expect(cleanCommands).not.toContain('tuff-cache/electron')
  })

  it('keeps the macOS release runner on macos-26 for the TranslationHelper macOS 26 SDK contract', () => {
    const build = workflow.jobs['build-and-release']
    const macEntry = build.strategy?.matrix?.include?.find(entry => entry.os === 'macos-latest')
    expect(macEntry?.image).toBe('macos-26')
  })
})
