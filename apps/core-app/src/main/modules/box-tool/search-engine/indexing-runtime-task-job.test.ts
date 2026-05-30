import { describe, expect, it } from 'vitest'
import { IndexedSourceRuntimeTaskJobFactory } from './indexing-runtime-task-job'

describe('IndexedSourceRuntimeTaskJobFactory', () => {
  it('creates per-kind runtime task ids with queued timestamps', () => {
    const factory = new IndexedSourceRuntimeTaskJobFactory()

    expect(factory.create('file-provider', 'scan')).toMatchObject({
      id: 'file-provider:scan:1',
      sourceId: 'file-provider',
      kind: 'scan',
      queuedAt: expect.any(Number)
    })
    expect(factory.create('app-provider', 'scan')).toMatchObject({
      id: 'app-provider:scan:2'
    })
    expect(factory.create('file-provider', 'reset')).toMatchObject({
      id: 'file-provider:reset:1'
    })
    expect(factory.create('file-provider', 'watch')).toMatchObject({
      id: 'file-provider:watch:1'
    })
    expect(factory.create('file-provider', 'reconcile')).toMatchObject({
      id: 'file-provider:reconcile:1'
    })
  })
})
