import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const currentFile = fileURLToPath(import.meta.url)
const mainRoot = path.resolve(path.dirname(currentFile), '..')

describe('quit paths', () => {
  it('does not use process.exit(0) in runtime quit handlers', () => {
    const targets = [
      path.resolve(mainRoot, 'channel/common.ts'),
      path.resolve(mainRoot, 'modules/tray/tray-menu-builder.ts'),
      path.resolve(mainRoot, 'modules/tray-holder.ts')
    ]

    for (const target of targets) {
      const source = fs.readFileSync(target, 'utf8')
      expect(source.includes('process.exit(0)')).toBe(false)
    }
  })
})
