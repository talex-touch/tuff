import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'
import {
  buildReleaseDownloadMatrix,
  buildReleaseNotesPayload,
  categorizePullRequest,
  extractLocalizedReleaseNotes,
  extractPrNumbersFromCommits,
  findPreviousSameChannelTag,
  inferReleaseChannel,
  shouldSkipPullRequest,
} from './generate-release-notes.mjs'

describe('generate-release-notes', () => {
  it('infers release channels from tags', () => {
    assert.equal(inferReleaseChannel('v2.4.11-beta.4'), 'BETA')
    assert.equal(inferReleaseChannel('v2.4.11-snapshot.1'), 'SNAPSHOT')
    assert.equal(inferReleaseChannel('v2.4.11'), 'RELEASE')
  })

  it('selects the previous tag from the same channel', () => {
    const tags = ['v2.4.11-beta.4', 'v2.4.11', 'v2.4.11-beta.3', 'v2.4.10']
    assert.equal(findPreviousSameChannelTag(tags, 'v2.4.11-beta.4'), 'v2.4.11-beta.3')
    assert.equal(findPreviousSameChannelTag(tags, 'v2.4.11'), 'v2.4.10')
  })

  it('extracts PR numbers from merge, squash, and PR link commits', () => {
    const commits = [
      { subject: 'Merge pull request #123 from branch', body: '' },
      { subject: 'feat(core): add panel (#124)', body: '' },
      { subject: 'docs: sync notes', body: 'Refs https://github.com/talex-touch/tuff/pull/125' },
      { subject: 'duplicate (#124)', body: '' },
    ]

    assert.deepEqual(extractPrNumbersFromCommits(commits), [123, 124, 125])
  })

  it('extracts localized release notes from PR bodies', () => {
    const body = [
      '## Summary',
      'Something',
      '### Release Notes',
      'zh: 修复 CoreBox 发版日志',
      'en: Fix CoreBox release notes',
      '## Additional Context',
      'Ignored',
    ].join('\n')

    assert.deepEqual(extractLocalizedReleaseNotes(body), {
      zh: '修复 CoreBox 发版日志',
      en: 'Fix CoreBox release notes',
    })
  })

  it('categorizes and skips pull requests by labels', () => {
    assert.equal(categorizePullRequest({ labels: [{ name: 'enhancement' }] }), 'features')
    assert.equal(categorizePullRequest({ labels: [{ name: 'bug' }] }), 'fixes')
    assert.equal(shouldSkipPullRequest({ labels: [{ name: 'skip-changelog' }] }), true)
  })

  it('builds the release download matrix', () => {
    const matrix = buildReleaseDownloadMatrix('en')

    assert.match(matrix, /## Download Based on Your Device/)
    assert.match(matrix, /\| Android \| APK ARMv8<br>APK ARMv7<br>APK x64 \(planned\) \|/)
    assert.match(matrix, /\| macOS \| \[ZIP Apple Silicon\]\(https:\/\/tuff\.tagzxia\.com\/updates\) \|/)
    assert.match(matrix, /\| Windows \| \[Setup x64\]\(https:\/\/tuff\.tagzxia\.com\/updates\) \|/)
  })

  it('builds bilingual notes and filters skip-changelog PRs', async () => {
    const payload = await buildReleaseNotesPayload({
      tag: 'v2.4.11-beta.4',
      previousTag: 'v2.4.11-beta.3',
      notesSourceDir: '',
      pullRequests: [
        {
          number: 10,
          title: 'feat(core): improve launcher',
          body: '### Release Notes\nzh: 优化启动器\n en: Improve launcher',
          user: { login: 'alice' },
          labels: [{ name: 'feature' }],
          html_url: 'https://github.com/talex-touch/tuff/pull/10',
        },
        {
          number: 11,
          title: 'chore: internal only',
          body: '',
          user: { login: 'bot' },
          labels: [{ name: 'skip-changelog' }],
          html_url: 'https://github.com/talex-touch/tuff/pull/11',
        },
      ],
    })

    assert.match(payload.zhNotes, /优化启动器/)
    assert.match(payload.enNotes, /Improve launcher/)
    assert.match(payload.githubBody, /Merged Pull Requests/)
    assert.match(payload.zhNotes, /## 按设备下载/)
    assert.match(payload.enNotes, /## Download Based on Your Device/)
    assert.equal((payload.githubBody.match(/## Download Based on Your Device/g) ?? []).length, 1)
    assert.ok(payload.githubBody.trimEnd().endsWith(buildReleaseDownloadMatrix('en').trimEnd()))
    assert.equal(payload.prs.length, 1)
  })

  it('fails strict generation when author notes are missing', async () => {
    await assert.rejects(
      buildReleaseNotesPayload({
        tag: 'v2.4.14-beta.1',
        previousTag: 'v2.4.13-beta.23',
        notesSourceDir: '',
        requireManualNotes: true,
      }),
      /strict bilingual contract/i,
    )
  })

  it('uses strict author notes verbatim and exposes localized summaries', async () => {
    const notesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-generated-notes-'))
    const version = '2.4.14-beta.1'
    try {
      const zh = strictZh(version)
      const en = strictEn(version)
      fs.writeFileSync(path.join(notesDir, `update_${version}.zh.md`), zh, 'utf8')
      fs.writeFileSync(path.join(notesDir, `update_${version}.en.md`), en, 'utf8')

      const payload = await buildReleaseNotesPayload({
        tag: `v${version}`,
        previousTag: 'v2.4.13-beta.23',
        notesSourceDir: notesDir,
        requireManualNotes: true,
      })

      assert.equal(payload.zhNotes, zh)
      assert.equal(payload.enNotes, en)
      assert.deepEqual(payload.releaseNotesAsset.summary, {
        zh: ['摘要一', '摘要二', '摘要三'],
        en: ['Summary one', 'Summary two', 'Summary three'],
      })
      assert.equal(payload.releaseNotesAsset.channel, 'BETA')
    }
    finally {
      fs.rmSync(notesDir, { recursive: true, force: true })
    }
  })
})

function strictZh(version) {
  return `# Tuff v${version} 更新说明\n\n## 摘要\n\n- 摘要一\n- 摘要二\n- 摘要三\n\n## 变更内容\n\n- 更新内容来自本地 author 文档。\n`
}

function strictEn(version) {
  return `# Tuff v${version} Release Notes\n\n## Summary Notes\n\n- Summary one\n- Summary two\n- Summary three\n\n## What's Changed\n\n- Update content now comes from local author documents.\n`
}
