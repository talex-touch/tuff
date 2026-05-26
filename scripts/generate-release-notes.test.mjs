import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
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
    assert.equal(payload.prs.length, 1)
  })
})
