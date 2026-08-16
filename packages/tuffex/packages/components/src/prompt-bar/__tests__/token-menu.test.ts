import type { PromptBarCommand, PromptBarSource } from '../src/types'
import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { parseToken, useTokenMenu } from '../src/use-token-menu'

const sources: PromptBarSource[] = [
  { key: 'attach', name: 'Add photos & files', attach: true },
  { key: 'scoop', name: 'Scoop Data' },
  { key: 'web', name: 'Web search' },
]

const commands: PromptBarCommand[] = [
  { key: 'compare', name: '/compare' },
  { key: 'churn', name: '/churn-plan' },
  { key: 'restock', name: '/restock' },
]

function setup(initial = '') {
  const draft = ref(initial)
  const forced = ref(false)
  const scope = effectScope()
  const menu = scope.run(() =>
    useTokenMenu<PromptBarSource, PromptBarCommand>({ draft, sources, commands, forced }),
  )!

  return { draft, forced, menu, scope }
}

describe('parseToken', () => {
  it('reads a trailing @ token at the start of the draft', () => {
    expect(parseToken('@sco')).toEqual({ kind: 'at', query: 'sco', start: 0 })
  })

  it('points start at the trigger, not at the whitespace before it', () => {
    expect(parseToken('hey /comp')).toEqual({ kind: 'slash', query: 'comp', start: 4 })
  })

  it('lower-cases the query so matching is case-insensitive', () => {
    expect(parseToken('@Scoop')?.query).toBe('scoop')
  })

  it('ignores a trigger that is not at a word boundary', () => {
    expect(parseToken('write to you@host')).toBeNull()
  })

  it('ignores a token that is no longer being typed', () => {
    expect(parseToken('@Scoop Data ')).toBeNull()
  })

  it('opens on the bare trigger with an empty query', () => {
    expect(parseToken('@')).toEqual({ kind: 'at', query: '', start: 0 })
  })
})

describe('useTokenMenu', () => {
  it('matches sources anywhere in the name and commands by prefix', () => {
    const { draft, menu, scope } = setup('@data')
    expect(menu.rows.value.map(row => row.key)).toEqual(['scoop'])

    draft.value = '/c'
    expect(menu.menu.value).toBe('slash')
    expect(menu.rows.value.map(row => row.key)).toEqual(['compare', 'churn'])

    // `restock` contains "c" but does not start with it.
    expect(menu.rows.value.map(row => row.key)).not.toContain('restock')
    scope.stop()
  })

  it('opens with an empty query when forced, ignoring the draft token', () => {
    const { forced, menu, scope } = setup('@zzz')
    expect(menu.rows.value).toHaveLength(0)

    forced.value = true
    expect(menu.menu.value).toBe('at')
    expect(menu.query.value).toBe('')
    expect(menu.rows.value).toHaveLength(3)
    scope.stop()
  })

  it('lands the first arrow key on an end instead of stepping past it', () => {
    const { menu, scope } = setup('@')
    expect(menu.engaged.value).toBe(false)

    menu.move(1)
    expect(menu.engaged.value).toBe(true)
    expect(menu.activeIndex.value).toBe(0)

    menu.move(1)
    expect(menu.activeIndex.value).toBe(1)
    scope.stop()
  })

  it('wraps around both ends', () => {
    const { menu, scope } = setup('@')
    menu.move(-1)
    expect(menu.activeIndex.value).toBe(2)

    menu.move(1)
    expect(menu.activeIndex.value).toBe(0)

    menu.move(-1)
    expect(menu.activeIndex.value).toBe(2)
    scope.stop()
  })

  it('does nothing when there is no row to move to', () => {
    const { menu, scope } = setup('@zzz')
    menu.move(1)
    expect(menu.engaged.value).toBe(false)
    scope.stop()
  })

  it('clears the highlight when the query narrows', async () => {
    const { draft, menu, scope } = setup('@')
    menu.engage(2)
    expect(menu.activeIndex.value).toBe(2)

    draft.value = '@s'
    await nextTick()
    expect(menu.activeIndex.value).toBe(0)
    expect(menu.engaged.value).toBe(false)
    scope.stop()
  })

  it('replaces the pending token, keeping what came before it', () => {
    const { menu, scope } = setup('draft a note @sco')
    expect(menu.insert('@Scoop Data')).toBe('draft a note @Scoop Data ')
    scope.stop()
  })

  it('separates the insertion from the previous word when there is no token', () => {
    const { forced, menu, scope } = setup('summarize')
    forced.value = true
    expect(menu.insert('@Scoop Data')).toBe('summarize @Scoop Data ')
    scope.stop()
  })

  it('does not add a leading space to an empty draft', () => {
    const { forced, menu, scope } = setup('')
    forced.value = true
    expect(menu.insert('@Scoop Data')).toBe('@Scoop Data ')
    scope.stop()
  })

  it('closes on dismiss and reopens once typing resumes', async () => {
    const { draft, menu, scope } = setup('@sco')
    expect(menu.menu.value).toBe('at')

    menu.dismiss()
    expect(menu.menu.value).toBeNull()
    expect(menu.token.value).toBeNull()

    draft.value = '@scoo'
    await nextTick()
    expect(menu.menu.value).toBe('at')
    scope.stop()
  })

  it('exposes the row the highlight is on', () => {
    const { menu, scope } = setup('@')
    menu.engage(1)
    expect(menu.activeRow.value?.key).toBe('scoop')
    scope.stop()
  })
})
