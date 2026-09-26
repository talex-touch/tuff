import { describe, expect, it } from 'vitest'
import { structuredStrictStringify } from '../common/utils'

function roundTrip(value: unknown): unknown {
  return JSON.parse(structuredStrictStringify(value))
}

/**
 * Every main-process channel reply goes through this serializer before it reaches the renderer.
 * It used to mark any object it had already seen as `[Circular ~…]`, so an object referenced from
 * two places — a DAG, not a cycle — arrived as a string in its second position, and a renderer that
 * saved the payload back persisted that string as data. The intelligence config's
 * `promptBindings` carried `"[Circular ~root.data.data.capabilities.text.chat.promptBinding]"`
 * that way. Only an object on its own ancestor chain is a cycle.
 */
describe('structuredStrictStringify shared references', () => {
  it('serializes an object referenced from two branches in full at both', () => {
    const binding = { capabilityId: 'text.chat', promptId: 'capability.text.chat.default' }
    const config = {
      capabilities: { 'text.chat': { id: 'text.chat', promptBinding: binding } },
      promptBindings: [binding],
    }

    const serialized = structuredStrictStringify({ data: { data: config, version: 3 } })

    expect(serialized).not.toContain('[Circular')
    expect(JSON.parse(serialized)).toEqual(JSON.parse(JSON.stringify({ data: { data: config, version: 3 } })))
  })

  it('serializes the same object repeated in one array in full each time', () => {
    const item = { id: 1 }

    expect(roundTrip([item, item, { nested: item }])).toEqual([{ id: 1 }, { id: 1 }, { nested: { id: 1 } }])
  })
})

describe('structuredStrictStringify cycles', () => {
  it('still cuts a reference back to an ancestor, naming the ancestor path', () => {
    const node: Record<string, unknown> = { name: 'root' }
    node.self = node
    node.child = { parent: node, list: [] as unknown[] }
    ;(node.child as { list: unknown[] }).list.push(node.child)

    expect(roundTrip(node)).toEqual({
      name: 'root',
      self: '[Circular ~root]',
      child: { parent: '[Circular ~root]', list: ['[Circular ~root.child]'] },
    })
  })

  it('reports a shared object that loops onto itself at the branch it was reached through', () => {
    const shared: Record<string, unknown> = { id: 'shared' }
    shared.self = shared

    expect(roundTrip({ a: shared, b: [shared] })).toEqual({
      a: { id: 'shared', self: '[Circular ~root.a]' },
      b: [{ id: 'shared', self: '[Circular ~root.b[0]]' }],
    })
  })
})

describe('structuredStrictStringify other behaviour', () => {
  it('keeps its conversions for undefined, Date, Map, Set and Error', () => {
    const error = new Error('boom')

    expect(
      roundTrip({
        missing: undefined,
        list: [undefined, 1],
        at: new Date('2026-09-26T00:00:00.000Z'),
        map: new Map<unknown, unknown>([['a', 1], [2, 'b']]),
        set: new Set(['x', 'y']),
        error,
      }),
    ).toEqual({
      missing: null,
      list: [null, 1],
      at: '2026-09-26T00:00:00.000Z',
      map: { a: 1, 2: 'b' },
      set: ['x', 'y'],
      error: { name: 'Error', message: 'boom', stack: error.stack },
    })
  })

  it('still throws at the path of a value it cannot serialize', () => {
    expect(() => structuredStrictStringify({ a: { b: Symbol('s') } })).toThrow(
      'Cannot serialize property at path "root.a.b": type "symbol"',
    )
    expect(() => structuredStrictStringify({ n: 1n })).toThrow('path "root.n": type "BigInt"')
    expect(() => structuredStrictStringify({ w: new WeakMap() })).toThrow('path "root.w": type "WeakMap"')
    expect(() => structuredStrictStringify({ fn: () => 1 })).toThrow('path "root.fn": unknown type')
  })
})
