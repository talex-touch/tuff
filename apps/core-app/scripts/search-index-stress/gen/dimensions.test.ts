import { describe, expect, it } from 'vitest'
import { COPY_LARGE_FORMATS, COPY_SOURCE_SIZES } from './corpus'
import {
  ADMITTED_EXTENSIONS,
  CLASS_DIMENSIONS,
  CLASS_WEIGHTS,
  DIMENSIONS,
  FILE_TYPE_EXTENSIONS,
  FORBIDDEN,
  FORMAT_EXTENSIONS,
  MAX_CORPUS_BYTES,
  MAX_CORPUS_FILES,
  MAX_SCENARIO_WRITE_BYTES,
  PIXEL_SIZES,
  SEARCH_APP_QUERIES,
  SIZE_BYTES,
  maxCorpusBytes,
  valueIds,
  weightOf,
  type DimensionName
} from './dimensions'
import { CLASSES } from './plan'
import { QUERY_IDS } from './queries'

type Table = Exclude<DimensionName, 'app'>
const TABLES = Object.keys(DIMENSIONS) as Table[]
const MIB = 1024 * 1024
const RASTER = ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff']

function forbidden(tuple: Record<string, string>): boolean {
  return FORBIDDEN.some((row) =>
    (Object.keys(row) as DimensionName[]).every(
      (name) => name in tuple && row[name]?.includes(tuple[name] as string)
    )
  )
}

describe('the dimension table', () => {
  it.each(TABLES)('%s: ids are unique plain tokens with a positive weight and a note', (dim) => {
    const ids = valueIds(dim)
    expect(new Set(ids).size).toBe(ids.length)
    for (const [id, weight, note] of DIMENSIONS[dim]) {
      expect(id).toMatch(/^[a-z0-9][a-z0-9:_.-]*$/)
      expect(Number.isFinite(weight) && weight > 0, `${dim}=${id}`).toBe(true)
      expect(note.trim().length, `${dim}=${id}`).toBeGreaterThanOrEqual(3)
    }
  })

  it('every class names declared dimensions, and only search-app takes an app', () => {
    expect(Object.keys(CLASS_DIMENSIONS).sort()).toEqual([...CLASSES].sort())
    for (const cls of CLASSES) {
      for (const dim of CLASS_DIMENSIONS[cls])
        expect(dim === 'app' || TABLES.includes(dim as Table), `${cls}.${dim}`).toBe(true)
      expect(CLASS_DIMENSIONS[cls].includes('app')).toBe(cls === 'search-app')
      expect(CLASS_DIMENSIONS[cls].includes('query'), cls).toBe(true)
    }
  })

  it('weight overrides name declared values of dimensions their class has, with non-negative weights', () => {
    for (const [cls, overrides] of Object.entries(CLASS_WEIGHTS)) {
      expect(CLASSES).toContain(cls)
      for (const [dim, values] of Object.entries(overrides ?? {})) {
        expect(CLASS_DIMENSIONS[cls as (typeof CLASSES)[number]], `${cls}.${dim}`).toContain(dim)
        for (const [id, weight] of Object.entries(values)) {
          expect(valueIds(dim as Table), `${cls}.${dim}=${id}`).toContain(id)
          expect(Number.isFinite(weight) && weight >= 0, `${cls}.${dim}=${id}`).toBe(true)
        }
      }
    }
  })

  it('every class keeps at least one value in each of its dimensions', () => {
    for (const cls of CLASSES) {
      for (const dim of CLASS_DIMENSIONS[cls].filter((value): value is Table => value !== 'app')) {
        expect(
          valueIds(dim).some((id) => weightOf(cls, dim, id) > 0),
          `${cls}.${dim}`
        ).toBe(true)
      }
    }
  })

  it('weightOf falls back to the table weight and gives 0 for an unknown id', () => {
    expect(weightOf('create-image', 'format', 'png')).toBe(24)
    expect(weightOf('create-image', 'format', 'nope')).toBe(0)
    expect(weightOf('search-image', 'size', 'xlarge')).toBe(0)
    expect(weightOf('create-image', 'size', 'xlarge')).toBe(3)
  })

  it('search-app uses the 22 transforms that make sense for an app name', () => {
    expect(SEARCH_APP_QUERIES).toHaveLength(22)
    expect(
      valueIds('query')
        .filter((id) => weightOf('search-app', 'query', id) > 0)
        .sort()
    ).toEqual([...SEARCH_APP_QUERIES].sort())
    expect([...QUERY_IDS].sort()).toEqual(valueIds('query').sort())
  })

  it('acronyms are for apps only', () => {
    for (const cls of CLASSES.filter((value) => value !== 'search-app'))
      expect(weightOf(cls, 'query', 'acronym'), cls).toBe(0)
    expect(weightOf('search-app', 'query', 'acronym')).toBeGreaterThan(0)
  })
})

describe('forbidden combinations', () => {
  it('name declared dimensions and values, and some class has every dimension of the row', () => {
    for (const row of FORBIDDEN) {
      const names = Object.keys(row) as DimensionName[]
      expect(names.length).toBeGreaterThanOrEqual(2)
      for (const name of names) {
        expect(TABLES, name).toContain(name)
        for (const id of row[name] ?? [])
          expect(valueIds(name as Table), `${name}=${id}`).toContain(id)
      }
      expect(
        CLASSES.some((cls) => names.every((name) => CLASS_DIMENSIONS[cls].includes(name))),
        names.join('+')
      ).toBe(true)
    }
  })

  it('leave a way to create every format at every size a class allows', () => {
    for (const format of valueIds('format')) {
      for (const size of valueIds('size')) {
        if (forbidden({ format, size })) continue
        const modes = valueIds('writeMode').filter(
          (writeMode) => !forbidden({ format, size, writeMode })
        )
        expect(modes.length, `${format}/${size}`).toBeGreaterThan(0)
        expect(modes, `${format}/${size}`).toContain('direct')
      }
    }
  })

  it('keep what one scenario writes under 4 MiB', () => {
    const writes = (mode: string, bytes: number): number => {
      if (mode.startsWith('burst-')) return Number(mode.slice(6)) * bytes
      if (mode === 'overwrite') return bytes + SIZE_BYTES.small!
      return mode === 'copy-in' ? 0 : bytes
    }
    for (const writeMode of valueIds('writeMode')) {
      for (const size of valueIds('size')) {
        for (const format of valueIds('format')) {
          if (forbidden({ writeMode, size, format })) continue
          const bytes = format === 'zero-byte' ? 0 : (SIZE_BYTES[size] as number)
          expect(writes(writeMode, bytes), `${writeMode}/${size}/${format}`).toBeLessThanOrEqual(
            MAX_SCENARIO_WRITE_BYTES
          )
        }
      }
    }
  })

  it('offer copy-in only where a seeded copy source exists', () => {
    for (const format of valueIds('format')) {
      for (const size of valueIds('size')) {
        if (forbidden({ writeMode: 'copy-in', size, format })) continue
        if (format === 'zero-byte') continue
        expect((COPY_SOURCE_SIZES as readonly string[]).includes(size), `${format}/${size}`).toBe(
          true
        )
        if (size === 'large') expect(COPY_LARGE_FORMATS.has(format), format).toBe(true)
      }
    }
  })

  it('give touch-empty and empty files to zero-byte only, and wide strips to raster formats only', () => {
    for (const format of valueIds('format')) {
      expect(forbidden({ writeMode: 'touch-empty', format }), `touch-empty/${format}`).toBe(
        format !== 'zero-byte'
      )
      expect(forbidden({ format, size: 'empty' }), `empty/${format}`).toBe(format !== 'zero-byte')
      expect(forbidden({ format, size: 'wide' }), `wide/${format}`).toBe(!RASTER.includes(format))
    }
    expect(forbidden({ format: 'zero-byte', size: 'tiny' })).toBe(true)
  })
})

describe('sizes and budgets', () => {
  it('SIZE_BYTES covers exactly the declared sizes, smallest first', () => {
    expect(Object.keys(SIZE_BYTES).sort()).toEqual(valueIds('size').sort())
    const order = ['empty', 'tiny', 'small', 'medium', 'large', 'xlarge'].map(
      (size) => SIZE_BYTES[size] as number
    )
    expect(order).toEqual([0, 2048, 24 * 1024, 200 * 1024, MIB, 3 * MIB])
    expect(SIZE_BYTES.wide).toBe(2_400_000)
  })

  it('wide strips are 12,288 x 64 pixels, the only size with a fixed pixel size', () => {
    expect(PIXEL_SIZES).toEqual({ wide: { width: 12_288, height: 64 } })
    expect(Object.keys(PIXEL_SIZES).every((size) => size in SIZE_BYTES)).toBe(true)
    expect(PIXEL_SIZES.wide!.width * PIXEL_SIZES.wide!.height * 3).toBeLessThan(SIZE_BYTES.wide!)
  })

  it('the corpus cap is 64 MiB at 10,000 scenarios, scales with the count and never drops below 24 MiB', () => {
    expect(MAX_CORPUS_BYTES).toBe(64 * MIB)
    expect(MAX_CORPUS_FILES).toBe(8000)
    expect(maxCorpusBytes(10_000)).toBe(64 * MIB)
    expect(maxCorpusBytes(20_000)).toBe(128 * MIB)
    expect(maxCorpusBytes(0)).toBe(24 * MIB)
    expect(maxCorpusBytes(200)).toBe(24 * MIB)
    expect(maxCorpusBytes(5000)).toBe(32 * MIB)
    for (let count = 0; count < 12_000; count += 500)
      expect(maxCorpusBytes(count + 500)).toBeGreaterThanOrEqual(maxCorpusBytes(count))
  })
})

describe('extensions', () => {
  it('every extension is lowercase without a dot and the admitted set holds them all', () => {
    const all = [
      ...Object.values(FILE_TYPE_EXTENSIONS).flat(),
      ...Object.values(FORMAT_EXTENSIONS).flat()
    ]
    for (const ext of all) {
      expect(ext).toMatch(/^[a-z0-9]+$/)
      expect(ADMITTED_EXTENSIONS.has(ext), ext).toBe(true)
    }
    expect(ADMITTED_EXTENSIONS.size).toBe(new Set(all).size)
  })

  it('formats and file types are declared in the table', () => {
    expect(Object.keys(FORMAT_EXTENSIONS).sort()).toEqual(valueIds('format').sort())
    expect(Object.keys(FILE_TYPE_EXTENSIONS).sort()).toEqual(valueIds('fileType').sort())
  })

  it('.tif is not an admitted extension (the indexer skips it), .tiff is', () => {
    expect(ADMITTED_EXTENSIONS.has('tif')).toBe(false)
    expect(ADMITTED_EXTENSIONS.has('tiff')).toBe(true)
    expect(FORMAT_EXTENSIONS.jpg).toEqual(['jpg', 'jpeg'])
  })
})
