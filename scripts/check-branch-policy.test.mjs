import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

import {
  classifyBranch,
  DEPENDABOT_BASE_BRANCH,
  DEPENDABOT_ECOSYSTEMS,
  DEPENDABOT_LOGIN,
  evaluate,
  fromEnvironment,
  parseArgs,
  validateDependabotBranchName,
} from './check-branch-policy.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts', 'check-branch-policy.mjs')

const DEPENDABOT_MASTER_PR = {
  eventName: 'pull_request',
  baseBranch: DEPENDABOT_BASE_BRANCH,
  prAuthor: DEPENDABOT_LOGIN,
}

const BASE_STATE = {
  branch: 'task/fix/sample',
  tag: '',
  eventName: 'pull_request',
  baseBranch: 'master',
  prAuthor: 'octocat',
  remoteBranches: ['master', 'stage', 'gh-pages'],
  masterPresent: true,
  stagePresent: true,
  historyComplete: true,
  masterContainedInStage: true,
  tags: [{ name: 'v2.4.14', kind: 'stable', onMaster: true, onStage: true }],
  tagRelativeToMaster: false,
  tagRelativeToStage: false,
  tagRefMismatch: null,
}

function withEventFile(payload, run) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'branch-policy-event-'))
  try {
    const eventPath = path.join(dir, 'event.json')
    writeFileSync(eventPath, JSON.stringify(payload))
    return run(eventPath)
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('branch policy: Dependabot PR allow rule', () => {
  it('allows valid dependabot PRs targeting master across all configured ecosystems', () => {
    const validBranches = [
      'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
      'dependabot/npm_and_yarn/anthropic-ai/claude-agent-sdk-0.3.330',
      'dependabot/npm_and_yarn/codemirror/autocomplete-6.20.4',
      'dependabot/npm_and_yarn/npm-security-updates-a1b2c3d4e5',
      'dependabot/cargo/packages/tuff-native/cc-1.11.3',
      'dependabot/cargo/packages/tuff-native/napi-derive-3.7.1',
      'dependabot/github_actions/jdx/mise-action-5.3.0',
      'dependabot/github_actions/Swatinem/rust-cache-2.9.3',
    ]

    for (const branch of validBranches) {
      assert.deepEqual(
        classifyBranch(branch, DEPENDABOT_MASTER_PR),
        { ok: true, kind: 'dependabot' },
        `expected ${branch} to pass for dependabot PR -> master`,
      )

      const results = evaluate({
        ...BASE_STATE,
        branch,
        ...DEPENDABOT_MASTER_PR,
      })
      const i3 = results.find(entry => entry.id === 'I3')
      assert.equal(i3?.level, 'OK', `expected I3:OK for ${branch}`)
      assert.match(i3?.text ?? '', /dependabot PR -> master by dependabot\[bot\]/)
      assert.equal(results.filter(entry => entry.level === 'FAIL').length, 0)
    }
  })

  it('rejects dependabot PRs targeting stage or non-master base branches', () => {
    for (const baseBranch of ['stage', 'task/feat/other', 'release/3.0', '']) {
      const verdict = classifyBranch('dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21', {
        eventName: 'pull_request',
        baseBranch,
        prAuthor: DEPENDABOT_LOGIN,
      })
      assert.equal(verdict.ok, false, `expected base "${baseBranch}" to fail`)
      assert.match(verdict.reason, /must target master/)

      const results = evaluate({
        ...BASE_STATE,
        branch: 'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
        eventName: 'pull_request',
        baseBranch,
        prAuthor: DEPENDABOT_LOGIN,
      })
      assert.equal(results.find(entry => entry.id === 'I3')?.level, 'FAIL')
    }
  })

  it('rejects human-opened PRs, missing PR author, direct pushes, and local runs on dependabot/*', () => {
    const branch = 'dependabot/cargo/packages/tuff-native/cc-1.11.3'
    const forbiddenContexts = [
      { label: 'human PR', ctx: { eventName: 'pull_request', baseBranch: 'master', prAuthor: 'talexdreamsoul' } },
      { label: 'spoofed bot login', ctx: { eventName: 'pull_request', baseBranch: 'master', prAuthor: 'dependabot' } },
      { label: 'missing PR author', ctx: { eventName: 'pull_request', baseBranch: 'master', prAuthor: '' } },
      { label: 'direct push', ctx: { eventName: 'push', baseBranch: '', prAuthor: '' } },
      { label: 'push even with base/author fields', ctx: { eventName: 'push', baseBranch: 'master', prAuthor: DEPENDABOT_LOGIN } },
      { label: 'workflow_dispatch', ctx: { eventName: 'workflow_dispatch', baseBranch: '', prAuthor: '' } },
      { label: 'local/no context', ctx: undefined },
    ]

    for (const { label, ctx } of forbiddenContexts) {
      const verdict = classifyBranch(branch, ctx)
      assert.equal(verdict.ok, false, `expected ${label} to fail closed`)
    }
  })

  it('rejects malformed dependabot/* branch names even for dependabot[bot] PRs -> master', () => {
    const malformed = [
      'dependabot',
      'dependabot/',
      'dependabot/npm_and_yarn',
      'dependabot/npm_and_yarn/',
      'dependabot/npm_and_yarn//vitepress-2.0.0',
      'dependabot/npm_and_yarn/vitepress-2.0.0/',
      'dependabot/feat/not-an-ecosystem',
      'dependabot/NPM_AND_YARN/vitepress-2.0.0',
      'Dependabot/npm_and_yarn/vitepress-2.0.0',
      'dependabot/npm_and_yarn/..',
      'dependabot/npm_and_yarn/a/../b',
      'dependabot/npm_and_yarn/pkg..ver',
      'dependabot/npm_and_yarn/.hidden',
      'dependabot/npm_and_yarn/-leading',
      'dependabot/npm_and_yarn/pkg.',
      'dependabot/npm_and_yarn/pkg.lock',
      'dependabot/npm_and_yarn/@scope/pkg-1.0.0',
      'dependabot/npm_and_yarn/pkg 1.0.0',
      `dependabot/npm_and_yarn/${'a'.repeat(200)}`,
    ]

    for (const branch of malformed) {
      assert.equal(validateDependabotBranchName(branch).ok, false, `expected shape check to reject ${branch}`)
      assert.equal(classifyBranch(branch, DEPENDABOT_MASTER_PR).ok, false, `expected classifyBranch to reject ${branch}`)
    }
  })

  it('keeps human branch rules strict and unchanged', () => {
    const humanCtx = { eventName: 'pull_request', baseBranch: 'master', prAuthor: 'alice' }

    assert.deepEqual(classifyBranch('task/fix/branch-policy-allow-dependabot', humanCtx), { ok: true, kind: 'task' })
    assert.deepEqual(classifyBranch('task/chore/deps-update', humanCtx), { ok: true, kind: 'task' })

    const invalidHumanBranches = [
      'feat/without-task-prefix',
      'fix/corebox-freeze',
      'feature/my-branch',
      'develop',
      'main',
      'task/fix',
      'task/fix/a/b',
      'task/hotfix/urgent',
      'task/feat/UpperCase',
    ]

    for (const branch of invalidHumanBranches) {
      assert.equal(classifyBranch(branch, humanCtx).ok, false, `expected human branch ${branch} to be rejected`)
      assert.equal(classifyBranch(branch, DEPENDABOT_MASTER_PR).ok, false, `expected ${branch} to stay rejected even under bot context`)
    }
  })

  it('treats well-formed origin/dependabot/* branches as clean in W1 remote audit while flagging malformed ones', () => {
    const cleanAudit = evaluate({
      ...BASE_STATE,
      remoteBranches: [
        'master',
        'stage',
        'gh-pages',
        'dependabot/cargo/packages/tuff-native/cc-1.11.3',
        'dependabot/github_actions/Swatinem/rust-cache-2.9.3',
        'dependabot/npm_and_yarn/anthropic-ai/claude-agent-sdk-0.3.330',
      ],
    })
    assert.equal(cleanAudit.find(entry => entry.id === 'W1')?.level, 'OK')

    const dirtyAudit = evaluate({
      ...BASE_STATE,
      remoteBranches: ['master', 'stage', 'dependabot/feat/spoofed', 'release/3.0'],
    })
    const w1 = dirtyAudit.find(entry => entry.id === 'W1')
    assert.equal(w1?.level, 'WARN')
    assert.match(w1?.text ?? '', /dependabot\/feat\/spoofed/)
    assert.match(w1?.text ?? '', /release\/3\.0/)
  })

  it('resolves PR author from GITHUB_EVENT_PATH and ignores GITHUB_ACTOR on maintainer re-runs', () => {
    withEventFile(
      {
        pull_request: {
          user: { login: DEPENDABOT_LOGIN },
          base: { ref: 'master' },
        },
      },
      (eventPath) => {
        const resolved = fromEnvironment(
          parseArgs([]),
          {
            GITHUB_EVENT_NAME: 'pull_request',
            GITHUB_HEAD_REF: 'dependabot/github_actions/jdx/mise-action-5.3.0',
            GITHUB_BASE_REF: 'master',
            GITHUB_ACTOR: 'talexdreamsoul',
            GITHUB_EVENT_PATH: eventPath,
          },
        )
        assert.equal(resolved.eventName, 'pull_request')
        assert.equal(resolved.branch, 'dependabot/github_actions/jdx/mise-action-5.3.0')
        assert.equal(resolved.baseBranch, 'master')
        assert.equal(resolved.prAuthor, DEPENDABOT_LOGIN)
        assert.deepEqual(classifyBranch(resolved.branch, resolved), { ok: true, kind: 'dependabot' })
      },
    )
  })

  it('fails closed when GITHUB_EVENT_PATH is missing or unreadable even if GITHUB_ACTOR is dependabot[bot]', () => {
    const resolved = fromEnvironment(
      parseArgs([]),
      {
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_HEAD_REF: 'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
        GITHUB_BASE_REF: 'master',
        GITHUB_ACTOR: DEPENDABOT_LOGIN,
        GITHUB_EVENT_PATH: '/nonexistent/branch-policy-event.json',
      },
    )
    assert.equal(resolved.prAuthor, '')
    assert.equal(classifyBranch(resolved.branch, resolved).ok, false)
  })

  it('executes cleanly end-to-end via CLI for valid and invalid Dependabot PR contexts', () => {
    const okOut = execFileSync(
      process.execPath,
      [
        SCRIPT,
        '--offline',
        '--branch',
        'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
        '--base',
        'master',
        '--pr-author',
        DEPENDABOT_LOGIN,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    )
    assert.match(okOut, /OK\s+I3\s+branch name dependabot\/npm_and_yarn\/vitepress-2\.0\.0-alpha\.21/)
    assert.match(okOut, /== result: pass/)

    let stageExit = 0
    let stageOut = ''
    try {
      execFileSync(
        process.execPath,
        [
          SCRIPT,
          '--offline',
          '--branch',
          'dependabot/npm_and_yarn/vitepress-2.0.0-alpha.21',
          '--base',
          'stage',
          '--pr-author',
          DEPENDABOT_LOGIN,
        ],
        { cwd: ROOT, encoding: 'utf8' },
      )
    }
    catch (error) {
      stageExit = error.status
      stageOut = `${error.stdout ?? ''}${error.stderr ?? ''}`
    }
    assert.equal(stageExit, 1)
    assert.match(stageOut, /FAIL\s+I3.*must target master, got base branch "stage"/)
    assert.ok(DEPENDABOT_ECOSYSTEMS.includes('npm_and_yarn'))
  })
})
