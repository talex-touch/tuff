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

describe('file-protocol canonical tfile parsing', () => {
  it('accepts host-style darwin paths emitted by renderer requests', () => {
    expect(__test__.extractAbsolutePath('tfile://users/demo/report.txt')).toBe(
      '/users/demo/report.txt'
    )
  })

  it('accepts host-style Windows drive URLs', () => {
    expect(__test__.extractAbsolutePath('tfile://C:/Users/demo/report.txt')).toBe(
      'C:/Users/demo/report.txt'
    )
  })

  it('preserves Windows drive letters from normalized URLs', () => {
    expect(__test__.extractAbsolutePath('tfile:///C:/Users/demo/report.txt')).toBe(
      'C:/Users/demo/report.txt'
    )
  })
})
