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

  it('exports the official AppImage no-FUSE signal for the packaged Linux launch', () => {
    const build = workflow.jobs['build-and-release']
    const launch = build.steps.find(step => step.name === 'Smoke: launch the packaged Linux app')
    expect(launch, 'the Linux packaged launch smoke must exist').toBeDefined()

    const launchLine = launch.run
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line.includes('timeout --signal=TERM 45s'))
    expect(launchLine).toMatch(/^APPIMAGE_EXTRACT_AND_RUN=1 timeout /)
    expect(launchLine).toContain('"$APPIMAGE" --appimage-extract-and-run --disable-gpu')
  })
})
