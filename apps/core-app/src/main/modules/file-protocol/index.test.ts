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
  it('rejects legacy two-slash tfile URLs', () => {
    expect(__test__.extractAbsolutePath('tfile://Users/demo/report.txt')).toBeNull()
  })

  it('preserves Windows drive letters from normalized URLs', () => {
    expect(__test__.extractAbsolutePath('tfile:///C:/Users/demo/report.txt')).toBe(
      'C:/Users/demo/report.txt'
    )
  })
})
