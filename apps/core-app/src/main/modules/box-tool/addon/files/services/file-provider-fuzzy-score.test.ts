import { describe, expect, it } from 'vitest'
import { scoreFileFuzzyMatch, scoreFzfSubsequence } from './file-provider-fuzzy-score'

const RESUME_NFC = 'résumé'.normalize('NFC')
const RESUME_NFD = 'résumé'.normalize('NFD')

describe('scoreFileFuzzyMatch', () => {
  it('keeps exact, prefix and substring ownership strictly above the fuzzy stage', () => {
    const bands: Array<{ name: string; query: string; fileName: string; expected: number }> = [
      { name: 'the file name as typed', query: 'report.pdf', fileName: 'report.pdf', expected: 1 },
      // The stem carries the same ownership as the full name: `report` owns `report.pdf`.
      { name: 'the stem of the file name', query: 'report', fileName: 'report.pdf', expected: 1 },
      { name: 'a prefix of the file name', query: 'rep', fileName: 'report.pdf', expected: 0.97 },
      {
        name: 'a substring of the file name',
        query: 'port',
        fileName: 'report.pdf',
        expected: 0.92
      }
    ]

    for (const band of bands) {
      expect(
        scoreFileFuzzyMatch(band.query, band.fileName, `/home/me/${band.fileName}`),
        band.name
      ).toBe(band.expected)
    }

    // A subsequence-only candidate must stay below the substring band, or fuzzy matches would
    // outrank owned matches at the same weight.
    const subsequenceOnly = scoreFileFuzzyMatch('rpt', 'report.pdf', '/home/me/report.pdf')
    expect(subsequenceOnly).toBeGreaterThan(0)
    expect(subsequenceOnly).toBeLessThan(0.92)
  })

  it('scores a consecutive run above a scattered run of the same characters', () => {
    // Same boundary profile (first match at the start of the name, the rest inside the word),
    // so the only difference left is the size of the gaps between the matched characters.
    expect(scoreFzfSubsequence('readme.md', 'rdm')).toBeGreaterThan(
      scoreFzfSubsequence('rxxdxxm.md', 'rdm')
    )
  })

  it('scores a match that starts on a word boundary above one buried inside a word', () => {
    const onBoundary = scoreFzfSubsequence('my-config.ts', 'cfg')
    const insideWord = scoreFzfSubsequence('mcxfxngx.ts', 'cfg')

    expect(onBoundary).toBeGreaterThan(insideWord)
    expect(insideWord).toBeGreaterThan(0)
  })

  it('ranks the same match in the file name above one that only exists in the path', () => {
    const pathOnly = scoreFileFuzzyMatch('core', 'main.ts', '/work/cfg/core/main.ts')
    const inFileName = scoreFileFuzzyMatch('core', 'core-notes.md', '/work/cfg/core-notes.md')

    // Path matches are still candidates, just never as strong as a file-name match.
    expect(pathOnly).toBeGreaterThan(0)
    expect(inFileName).toBeGreaterThan(pathOnly)
  })

  it('keeps a typo or subsequence candidate alive while an unrelated name scores zero', () => {
    // One transposed pair: exactly what the subsequence and n-gram candidate queries feed here.
    expect(scoreFileFuzzyMatch('settnig', 'settings.ts', '/home/me/settings.ts')).toBeGreaterThan(0)
    expect(scoreFileFuzzyMatch('settnig', 'report.pdf', '/home/me/report.pdf')).toBe(0)
  })

  it('matches across Unicode normalization forms, ignores surrounding blanks, and scores an empty query as no match', () => {
    expect(scoreFileFuzzyMatch(RESUME_NFD, `${RESUME_NFC}.pdf`, `/home/me/${RESUME_NFC}.pdf`)).toBe(
      1
    )
    expect(scoreFileFuzzyMatch('  report  ', 'report.pdf', '/home/me/report.pdf')).toBe(1)
    expect(scoreFileFuzzyMatch('   ', 'report.pdf', '/home/me/report.pdf')).toBe(0)
  })
})
