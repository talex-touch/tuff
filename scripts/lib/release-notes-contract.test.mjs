import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { validateReleaseNotesPair } from './release-notes-contract.mjs'

const VERSION = '9.9.9-beta.1'

function zhNotes(overrides = {}) {
  const {
    summary = ['新增快捷入口', '优化更新体验', '修复启动问题'],
    whatsNew = [],
    whatsChanged = ['更新流程现在会在失败时给出明确提示。'],
    breakingChanges = [],
    knownLimitations = [],
  } = overrides

  return renderNotes({
    title: `# Tuff v${VERSION} 更新说明`,
    headings: {
      summary: '摘要',
      whatsNew: '新增内容',
      whatsChanged: '变更内容',
      breakingChanges: '破坏性变更',
      knownLimitations: '已知限制',
    },
    summary,
    whatsNew,
    whatsChanged,
    breakingChanges,
    knownLimitations,
  })
}

function enNotes(overrides = {}) {
  const {
    summary = ['Add a shortcut entry', 'Improve the update experience', 'Fix a startup issue'],
    whatsNew = [],
    whatsChanged = ['The update flow now reports actionable failures.'],
    breakingChanges = [],
    knownLimitations = [],
  } = overrides

  return renderNotes({
    title: `# Tuff v${VERSION} Release Notes`,
    headings: {
      summary: 'Summary Notes',
      whatsNew: 'What\'s New',
      whatsChanged: 'What\'s Changed',
      breakingChanges: 'Breaking Changes',
      knownLimitations: 'Known Limitations',
    },
    summary,
    whatsNew,
    whatsChanged,
    breakingChanges,
    knownLimitations,
  })
}

function renderNotes({ title, headings, ...sections }) {
  const blocks = [title]

  for (const key of ['summary', 'whatsNew', 'whatsChanged', 'breakingChanges', 'knownLimitations']) {
    const entries = sections[key]
    if (!entries.length)
      continue
    blocks.push(`## ${headings[key]}`, entries.map(entry => `- ${entry}`).join('\n'))
  }

  return `${blocks.join('\n\n')}\n`
}

function errorCodes(result) {
  return result.errors.map(error => error.code)
}

describe('release notes contract', () => {
  it('accepts paired bilingual notes without a placeholder What\'s New section', () => {
    const result = validateReleaseNotesPair({
      version: VERSION,
      zhMarkdown: zhNotes(),
      enMarkdown: enNotes(),
    })

    assert.equal(result.valid, true)
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.documents?.zh.summary, ['新增快捷入口', '优化更新体验', '修复启动问题'])
    assert.deepEqual(result.documents?.en.whatsNew, [])
  })

  it('requires three to six Summary Notes in each language', () => {
    const result = validateReleaseNotesPair({
      version: VERSION,
      zhMarkdown: zhNotes({ summary: ['摘要一', '摘要二'] }),
      enMarkdown: enNotes({ summary: ['Summary one', 'Summary two'] }),
    })

    assert.equal(result.valid, false)
    assert.equal(errorCodes(result).filter(code => code === 'summary-count').length, 2)
  })

  it('requires a non-empty What\'s Changed section', () => {
    const result = validateReleaseNotesPair({
      version: VERSION,
      zhMarkdown: zhNotes({ whatsChanged: [] }),
      enMarkdown: enNotes({ whatsChanged: [] }),
    })

    assert.equal(result.valid, false)
    assert.equal(errorCodes(result).filter(code => code === 'missing-required-section').length, 2)
  })

  it('rejects mismatched optional sections and item counts', () => {
    const result = validateReleaseNotesPair({
      version: VERSION,
      zhMarkdown: zhNotes({
        whatsNew: ['新增版本历史'],
        knownLimitations: ['旧版本日志可能不完整'],
      }),
      enMarkdown: enNotes({
        whatsNew: ['Add release history', 'Add release detail deep links'],
      }),
    })

    assert.equal(result.valid, false)
    assert.ok(errorCodes(result).includes('section-set-mismatch'))
    assert.ok(errorCodes(result).includes('section-item-count-mismatch'))
  })

  it('rejects placeholders and a title for another version', () => {
    const result = validateReleaseNotesPair({
      version: VERSION,
      zhMarkdown: zhNotes({ knownLimitations: ['无', '待定：发布前补充'] }).replace(
        VERSION,
        '9.9.8',
      ),
      enMarkdown: enNotes({ knownLimitations: ['N/A', 'TODO: fill before release'] }),
    })

    assert.equal(result.valid, false)
    assert.ok(errorCodes(result).includes('title-mismatch'))
    assert.equal(errorCodes(result).filter(code => code === 'placeholder-content').length, 4)
  })
})
