import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'vitest'
import { buildReleaseNotesCatalog } from './generate-release-notes-catalog.mjs'

function writeConfig(root) {
  const notesDir = path.join(root, 'notes')
  fs.mkdirSync(notesDir, { recursive: true })
  fs.writeFileSync(
    path.join(notesDir, 'release-notes.config.json'),
    JSON.stringify({
      schemaVersion: 1,
      legacyThrough: {
        RELEASE: '1.0.0',
        BETA: '1.0.0-beta.1',
      },
    }),
  )
}

function writeNotes(root, version, zhSummary, enSummary) {
  const notesDir = path.join(root, 'notes')
  fs.writeFileSync(
    path.join(notesDir, `update_${version}.zh.md`),
    `# Tuff v${version} 更新说明\n\n## 摘要\n\n${zhSummary.map(item => `- ${item}`).join('\n')}\n\n## 变更内容\n\n- 更新 ${version}。\n`,
  )
  fs.writeFileSync(
    path.join(notesDir, `update_${version}.en.md`),
    `# Tuff v${version} Release Notes\n\n## Summary Notes\n\n${enSummary.map(item => `- ${item}`).join('\n')}\n\n## What's Changed\n\n- Update ${version}.\n`,
  )
}

describe('generate release notes catalog', () => {
  it('bundles bilingual summaries for every enforced version', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-notes-catalog-'))
    try {
      writeConfig(root)
      writeNotes(root, '1.1.0-beta.1', ['测试一', '测试二', '测试三'], ['Beta one', 'Beta two', 'Beta three'])
      writeNotes(root, '1.1.0', ['正式一', '正式二', '正式三'], ['Release one', 'Release two', 'Release three'])

      const catalog = buildReleaseNotesCatalog({ repoRoot: root, currentVersion: '1.1.0' })

      assert.equal(catalog.schemaVersion, 1)
      assert.equal(catalog.generatedForVersion, '1.1.0')
      assert.deepEqual(
        catalog.entries.map(entry => [entry.version, entry.channel]),
        [
          ['1.1.0-beta.1', 'BETA'],
          ['1.1.0', 'RELEASE'],
        ],
      )
      assert.deepEqual(catalog.entries[1].summary.en, ['Release one', 'Release two', 'Release three'])
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('fails when the enforced current version has no author notes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-notes-current-'))
    try {
      writeConfig(root)
      assert.throws(
        () => buildReleaseNotesCatalog({ repoRoot: root, currentVersion: '1.1.0' }),
        /current release notes/i,
      )
    }
    finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
