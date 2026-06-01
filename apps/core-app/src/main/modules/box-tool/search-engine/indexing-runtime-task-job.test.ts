import { describe, expect, it } from 'vitest'
import { IndexedSourceRuntimeTaskJobFactory } from './indexing-runtime-task-job'

describe('IndexedSourceRuntimeTaskJobFactory re-export', () => {
  it('keeps the CoreApp compatibility entry wired to the SDK factory', () => {
    const factory = new IndexedSourceRuntimeTaskJobFactory()

    expect(factory.create('file-provider', 'scan', 1234)).toEqual({
      id: 'file-provider:scan:1',
      sourceId: 'file-provider',
      kind: 'scan',
      queuedAt: 1234
    })
  })
})
