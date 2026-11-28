import { describe, expect, it } from 'vitest'
import { sanitizeEverythingCliQuery, validateEverythingCliPath } from './everything-backend-service'

/**
 * Option injection into the Everything CLI (#903).
 *
 * The raw query sat in argv[0], and es.exe reads any argument starting with `-` as an option.
 * `-export-csv C:\Users\Public\out.csv` was therefore consumed as the export switch and wrote
 * index contents to a chosen path instead of searching; `-r` and `-path` changed behaviour the
 * same way.
 *
 * Argument injection, not shell injection — exec is execFile with an args array — but the
 * option surface was reachable, and a query is not always typed by the user: a plugin or a
 * recommendation flow can supply text it did not author.
 */
describe('sanitizeEverythingCliQuery', () => {
  it('strips a leading dash so the query cannot become a switch', () => {
    expect(sanitizeEverythingCliQuery('-export-csv C:\\Users\\Public\\out.csv')).toBe(
      'export-csv C:\\Users\\Public\\out.csv'
    )
  })

  it('strips repeated and spaced leading dashes', () => {
    // `- -r`, `--path` and friends must not survive as options either.
    expect(sanitizeEverythingCliQuery('--path C:\\')).toBe('path C:\\')
    expect(sanitizeEverythingCliQuery('- -r evil')).toBe('r evil')
    expect(sanitizeEverythingCliQuery('   -r')).toBe('r')
  })

  it('leaves an ordinary query untouched', () => {
    // Positive control: a sanitiser that emptied everything would satisfy every assertion
    // above while breaking search entirely.
    for (const query of ['report.pdf', 'my file', 'C:\\Users\\me\\notes.txt', '2026-08 budget'])
      expect(sanitizeEverythingCliQuery(query)).toBe(query)
  })

  it('keeps dashes that are not at the start', () => {
    // The common real case — a hyphenated filename must still be searchable.
    expect(sanitizeEverythingCliQuery('quarterly-report-2026.pdf')).toBe(
      'quarterly-report-2026.pdf'
    )
    expect(sanitizeEverythingCliQuery('a -b')).toBe('a -b')
  })

  it('returns an empty string for input that is only dashes', () => {
    // An empty query is a search that finds nothing, which is the right outcome for input
    // that carried no search text to begin with.
    expect(sanitizeEverythingCliQuery('---')).toBe('')
    expect(sanitizeEverythingCliQuery('')).toBe('')
  })
})

/**
 * That searchCli actually calls it. The sanitiser is exported and unit-tested above; this
 * pins the call site, which is what a refactor drops.
 */
describe('searchCli argv', () => {
  it('passes the sanitised query, not the raw one', async () => {
    const { EverythingBackendService } = await import('./everything-backend-service')
    const calls: Array<{ args: string[] }> = []
    const service = new (EverythingBackendService as unknown as new (runtime: unknown) => {
      searchCli: (esPath: string, query: string, maxResults: number) => Promise<unknown>
    })({
      execFileAsync: async (_file: string, args: string[]) => {
        calls.push({ args })
        return { stdout: '', stderr: '' }
      }
    })

    await service.searchCli('es.exe', '-export-csv out.csv', 10)

    expect(calls).toHaveLength(1)
    expect(calls[0].args[0]).toBe('export-csv out.csv')
    expect(calls[0].args[0].startsWith('-')).toBe(false)
  })

  it('rejects non-es.exe binaries, UNC/mixed-slash/drive-relative paths, symlinks, and symlinked parents BEFORE executing probeCli', async () => {
    const { EverythingBackendService } = await import('./everything-backend-service')
    const calls: string[] = []
    const service = new EverythingBackendService({
      execFileAsync: (async (file: string) => {
        calls.push(file)
        return { stdout: '1.1.0.27', stderr: '' }
      }) as never,
      lstat: (async (target: string) => ({
        isSymbolicLink: () => String(target).includes('symlink'),
        isFile: () => true
      })) as never,
      realpath: (async (target: string) => {
        if (String(target).includes('junction-parent')) {
          return '\\\\attacker\\share\\es.exe'
        }
        if (String(target).includes('renamed-parent')) {
          return 'C:\\Windows\\System32\\cmd.exe'
        }
        return String(target)
      }) as never
    })

    for (const badPath of [
      'C:\\Windows\\System32\\calc.exe',
      '\\\\attacker\\share\\es.exe',
      '//attacker/share/es.exe',
      '\\/attacker/share/es.exe',
      '/\\attacker\\share\\es.exe',
      '\\\\?\\UNC\\attacker\\share\\es.exe',
      '\\/?\\UNC/attacker/share/es.exe',
      'C:es.exe',
      'C:subdir\\es.exe',
      'C:\\Tools\\..\\Evil\\es.exe',
      'C:\\Tools\\symlink\\es.exe',
      'C:\\Tools\\junction-parent\\es.exe',
      'C:\\Tools\\renamed-parent\\es.exe'
    ]) {
      await expect(service.probeCli(badPath), badPath).rejects.toThrow()
    }

    expect(calls).toEqual([])
    expect(validateEverythingCliPath('C:\\Program Files\\Everything\\es.exe')).toBe(
      'C:\\Program Files\\Everything\\es.exe'
    )
  })
})
