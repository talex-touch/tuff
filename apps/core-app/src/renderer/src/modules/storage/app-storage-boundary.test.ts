import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

const rendererRoot = join(process.cwd(), 'src/renderer/src')
const legacyStorageImport = ['modules', 'channel', 'storage'].join('/')

const allowedLegacyStorageFiles = new Set([
  'modules/channel/storage/base.ts',
  'modules/channel/storage/index.ts'
])
const legacyStorageImportPattern = new RegExp(
  String.raw`(?:from|import\(|doMock\()\s*["'][^"']*${legacyStorageImport}`
)

const sourceExtensions = new Set(['.ts', '.tsx', '.vue'])

function collectSourceFiles(dir: string): string[] {
  const files: string[] = []

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath))
      continue
    }

    const extension = entry.slice(entry.lastIndexOf('.'))
    if (sourceExtensions.has(extension)) {
      files.push(fullPath)
    }
  }

  return files
}

describe('renderer app storage boundary', () => {
  it('keeps legacy channel storage imports inside the bootstrap shim', () => {
    const offenders = collectSourceFiles(rendererRoot)
      .map((file) => relative(rendererRoot, file).split(sep).join('/'))
      .filter((file) => !allowedLegacyStorageFiles.has(file))
      .filter((file) => {
        const source = readFileSync(join(rendererRoot, file), 'utf8')
        return legacyStorageImportPattern.test(source)
      })

    expect(offenders).toEqual([])
  })
})
