import { describe, expect, it } from 'vitest'
import { isRecommendableNewFile } from './file-recommendation-admission'

const file = (
  path: string,
  extra: { size?: number | null; isDir?: boolean } = {}
): {
  path: string
  size?: number | null
  isDir?: boolean
} => ({ path, size: extra.size ?? 1024, isDir: extra.isDir })

describe('isRecommendableNewFile', () => {
  describe('admits work the user made', () => {
    it.each([
      ['a screenshot', '/Users/x/Desktop/Screenshot 2026-09-05.png'],
      ['a download', '/Users/x/Downloads/invoice.pdf'],
      ['a document with a space', '/Users/x/Documents/年度 报告.docx'],
      ['a source file in a project', '/Users/x/code/app/src/main.ts'],
      ['a Windows path', 'C:\\Users\\alice\\Pictures\\shot.png']
    ])('%s', (_label, path) => {
      expect(isRecommendableNewFile(file(path))).toBe(true)
    })
  })

  describe('rejects machine output', () => {
    it.each([
      ['node_modules', '/Users/x/code/node_modules/react/index.js'],
      ['a nested build dir', '/Users/x/code/app/dist/bundle.js'],
      ['a target dir', '/Users/x/rust/target/debug/thing.rs'],
      ['__pycache__', '/Users/x/py/__pycache__/mod.pyc'],
      ['a cache dir', '/Users/x/Library/Caches/app/blob.bin'],
      ['CocoaPods', '/Users/x/ios/Pods/Alamofire/Source.swift']
    ])('%s', (_label, path) => {
      expect(isRecommendableNewFile(file(path))).toBe(false)
    })

    it('rejects anything under a dot-directory, wherever it sits', () => {
      // .git, .venv, .cache — enumerating them would leave the next one admitted.
      expect(isRecommendableNewFile(file('/Users/x/code/.git/COMMIT_EDITMSG.txt'))).toBe(false)
      expect(isRecommendableNewFile(file('/Users/x/.venv/lib/thing.py'))).toBe(false)
      expect(isRecommendableNewFile(file('/Users/x/a/.next/static/chunk.js'))).toBe(false)
    })
  })

  describe('rejects byproducts and transfers in progress', () => {
    it.each([
      ['a log', '/Users/x/Downloads/app.log'],
      ['an in-flight Chrome download', '/Users/x/Downloads/movie.mp4.crdownload'],
      ['a vim swap file', '/Users/x/notes/todo.md.swp'],
      ['a lock file', '/Users/x/code/pnpm.lock'],
      ['a source map', '/Users/x/code/app/bundle.js.map'],
      ['a compiled class', '/Users/x/java/Thing.class']
    ])('%s', (_label, path) => {
      expect(isRecommendableNewFile(file(path))).toBe(false)
    })
  })

  describe('rejects things that are not documents at all', () => {
    it('rejects a directory', () => {
      expect(isRecommendableNewFile(file('/Users/x/Downloads/folder', { isDir: true }))).toBe(false)
    })

    it('rejects a dotfile', () => {
      expect(isRecommendableNewFile(file('/Users/x/code/.env'))).toBe(false)
      expect(isRecommendableNewFile(file('/Users/x/.zshrc'))).toBe(false)
    })

    it('rejects an extensionless file', () => {
      // Usually a binary or a tool artifact; a document the user made has an extension.
      expect(isRecommendableNewFile(file('/Users/x/code/Makefile'))).toBe(false)
    })

    it.each([
      ['.DS_Store', '/Users/x/Desktop/.DS_Store'],
      ['Thumbs.db', 'C:\\Users\\alice\\Pictures\\Thumbs.db'],
      ['desktop.ini', 'C:\\Users\\alice\\desktop.ini']
    ])('rejects %s', (_label, path) => {
      expect(isRecommendableNewFile(file(path))).toBe(false)
    })

    it('rejects an empty path', () => {
      expect(isRecommendableNewFile(file(''))).toBe(false)
      expect(isRecommendableNewFile(file('   '))).toBe(false)
    })
  })

  describe('size', () => {
    it('rejects a zero-byte placeholder', () => {
      expect(isRecommendableNewFile(file('/Users/x/Downloads/new.pdf', { size: 0 }))).toBe(false)
    })

    it('admits a file whose size the scanner did not record', () => {
      // Missing size is absence of evidence, not evidence of emptiness.
      expect(isRecommendableNewFile(file('/Users/x/Downloads/new.pdf', { size: null }))).toBe(true)
      expect(isRecommendableNewFile({ path: '/Users/x/Downloads/new.pdf' })).toBe(true)
    })
  })

  it('matches path segments case-insensitively', () => {
    expect(isRecommendableNewFile(file('/Users/x/Code/NODE_MODULES/a/b.js'))).toBe(false)
    expect(isRecommendableNewFile(file('/Users/x/Downloads/REPORT.PDF'))).toBe(true)
  })

  it('does not reject a file merely because a parent name contains an excluded word', () => {
    // 'distribution' is not 'dist'; segment matching must be exact, not substring.
    expect(isRecommendableNewFile(file('/Users/x/distribution/plan.pdf'))).toBe(true)
    expect(isRecommendableNewFile(file('/Users/x/building-plans/site.png'))).toBe(true)
  })
})
