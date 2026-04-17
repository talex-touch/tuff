import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  net: {
    fetch: vi.fn()
  },
  session: {
    defaultSession: {
      protocol: {
        handle: vi.fn(),
        unhandle: vi.fn()
      }
    }
  }
}))

import { __test__ } from './index'

describe('file-protocol legacy tfile normalization', () => {
  it('normalizes legacy two-slash tfile URLs and marks compat hits', () => {
    expect(__test__.extractAbsolutePath('tfile://Users/demo/report.txt')).toEqual({
      path: '/Users/demo/report.txt',
      usedCompatPath: true
    })
  })

  it('preserves Windows drive letters from normalized URLs', () => {
    expect(__test__.extractAbsolutePath('tfile:///C:/Users/demo/report.txt')).toEqual({
      path: 'C:/Users/demo/report.txt',
      usedCompatPath: false
    })
  })
})
