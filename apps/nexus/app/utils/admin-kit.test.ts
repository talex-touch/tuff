import { describe, expect, it } from 'vitest'
import {
  ADMIN_FIELD_CONTROL_SELECTOR,
  adminIdentityInitial,
  canConfirmAdminAction,
  findAdminFieldControl,
  resolveAdminIdentity,
  shouldShowAdminPager,
  syncAdminFieldControl,
  withIdReference,
} from './admin-kit'

describe('resolveAdminIdentity', () => {
  it('prints an email once when there is no name', () => {
    // The audit log showed "ui-audit-bot@local.test" as the name and again on
    // the line under it.
    const identity = resolveAdminIdentity({ name: null, email: 'ui-audit-bot@local.test' })
    expect(identity.primary).toBe('ui-audit-bot@local.test')
    expect(identity.secondary).toBeNull()
    expect(identity.title).toBe('ui-audit-bot@local.test')
  })

  it('puts the email under a name, unless the name is the email', () => {
    expect(resolveAdminIdentity({ name: 'Ada', email: 'ada@example.test' })).toMatchObject({
      primary: 'Ada',
      secondary: 'ada@example.test',
      title: 'Ada · ada@example.test',
    })
    expect(resolveAdminIdentity({ name: 'Ada@Example.test ', email: 'ada@example.test' }).secondary).toBeNull()
  })

  it('falls back to the account id, then to a dash', () => {
    expect(resolveAdminIdentity({ name: '  ', email: '', fallback: 'usr_123' }).primary).toBe('usr_123')
    expect(resolveAdminIdentity({}).primary).toBe('—')
    expect(resolveAdminIdentity({}).initial).toBe('')
  })
})

describe('adminIdentityInitial', () => {
  it('skips brackets, emoji and other symbols', () => {
    expect(adminIdentityInitial('[Robot] Builder')).toBe('R')
    expect(adminIdentityInitial('[江湖]')).toBe('江')
    expect(adminIdentityInitial('🎉 bob')).toBe('B')
    expect(adminIdentityInitial('  _7up')).toBe('7')
    expect(adminIdentityInitial('ada@example.test')).toBe('A')
  })

  it('returns nothing for text without a letter or digit', () => {
    expect(adminIdentityInitial('🎉 []')).toBe('')
    expect(adminIdentityInitial(null)).toBe('')
  })
})

describe('canConfirmAdminAction', () => {
  it('needs the exact text when one is required', () => {
    expect(canConfirmAdminAction({ requireText: 'DELETE', input: '' })).toBe(false)
    expect(canConfirmAdminAction({ requireText: 'DELETE', input: 'delete' })).toBe(false)
    expect(canConfirmAdminAction({ requireText: 'DELETE', input: ' DELETE ' })).toBe(true)
    expect(canConfirmAdminAction({ requireText: 'ada@example.test', input: 'ada@example.test' })).toBe(true)
  })

  it('is open without a required text, and closed while the action runs', () => {
    expect(canConfirmAdminAction({ input: '' })).toBe(true)
    expect(canConfirmAdminAction({ input: '', loading: true })).toBe(false)
    expect(canConfirmAdminAction({ requireText: 'DELETE', input: 'DELETE', loading: true })).toBe(false)
  })
})

describe('shouldShowAdminPager', () => {
  it('hides the pager for one page that no page size would split', () => {
    expect(shouldShowAdminPager({ total: 15, limit: 20, page: 1, pageSizes: [20, 50, 100] })).toBe(false)
    expect(shouldShowAdminPager({ total: 0, limit: 20, page: 1, pageSizes: [20, 50, 100] })).toBe(false)
  })

  it('shows it for several pages, past page one, or when a smaller size would split the rows', () => {
    expect(shouldShowAdminPager({ total: 61, limit: 20, page: 1 })).toBe(true)
    expect(shouldShowAdminPager({ total: 30, limit: 20, page: 2 })).toBe(true)
    // 61 rows at 100 a page are one page, but 20 a page would be four: the size
    // selector has to stay reachable.
    expect(shouldShowAdminPager({ total: 61, limit: 100, page: 1, pageSizes: [20, 50, 100] })).toBe(true)
  })
})

/** An element's attribute surface, enough for the field helpers. */
function fakeControl(attributes: Record<string, string> = {}) {
  const values = new Map(Object.entries(attributes))
  return {
    values,
    getAttribute: (name: string) => values.get(name) ?? null,
    setAttribute: (name: string, value: string) => void values.set(name, value),
    removeAttribute: (name: string) => void values.delete(name),
  }
}

describe('findAdminFieldControl', () => {
  it('looks the control up by the field\'s `for`, else takes the first combobox or input', () => {
    const control = fakeControl()
    const selectors: string[] = []
    const root = {
      querySelector: (selector: string) => {
        selectors.push(selector)
        return control
      },
    }
    expect(findAdminFieldControl(root, 'v-0-1')).toBe(control)
    expect(findAdminFieldControl(root, 'odd"id')).toBe(control)
    expect(findAdminFieldControl(root)).toBe(control)
    expect(selectors).toEqual(['[id="v-0-1"]', '[id="odd\\"id"]', ADMIN_FIELD_CONTROL_SELECTOR])
    expect(findAdminFieldControl(null, 'v-0-1')).toBeNull()
  })
})

describe('withIdReference', () => {
  it('adds or removes one id and keeps the others in order', () => {
    expect(withIdReference(null, 'hint', true)).toBe('hint')
    expect(withIdReference('own  other', 'hint', true)).toBe('own other hint')
    expect(withIdReference('own hint other', 'hint', true)).toBe('own other hint')
    expect(withIdReference('own hint', 'hint', false)).toBe('own')
    expect(withIdReference('hint', 'hint', false)).toBeNull()
  })
})

describe('syncAdminFieldControl', () => {
  const base = { labelId: 'label', labelledByFor: false, hintId: null, invalid: false }

  it('names an unnamed control after the label, unless a `<label for>` or an existing name does', () => {
    const unnamed = fakeControl()
    syncAdminFieldControl(unnamed, base)
    expect(unnamed.values.get('aria-labelledby')).toBe('label')

    const byFor = fakeControl()
    syncAdminFieldControl(byFor, { ...base, labelledByFor: true })
    expect(byFor.values.has('aria-labelledby')).toBe(false)

    const named = fakeControl({ 'aria-label': 'Search' })
    syncAdminFieldControl(named, base)
    expect(named.values.has('aria-labelledby')).toBe(false)
  })

  it('describes the control by the hint, keeping ids it did not write, and drops its own when the hint goes', () => {
    const control = fakeControl({ 'aria-describedby': 'page-note' })
    let applied = syncAdminFieldControl(control, { ...base, hintId: 'hint' })
    expect(control.values.get('aria-describedby')).toBe('page-note hint')
    // A second sync with the same hint changes nothing.
    applied = syncAdminFieldControl(control, { ...base, hintId: 'hint' }, applied)
    expect(control.values.get('aria-describedby')).toBe('page-note hint')

    applied = syncAdminFieldControl(control, base, applied)
    expect(control.values.get('aria-describedby')).toBe('page-note')
    expect(applied).toEqual({ hintId: null, invalid: false })
  })

  it('marks the control invalid while the field is, and clears only the mark it set', () => {
    const control = fakeControl()
    let applied = syncAdminFieldControl(control, { ...base, invalid: true })
    expect(control.values.get('aria-invalid')).toBe('true')
    applied = syncAdminFieldControl(control, base, applied)
    expect(control.values.has('aria-invalid')).toBe(false)

    // An `aria-invalid` the field never wrote is not its to take away.
    const foreign = fakeControl({ 'aria-invalid': 'true' })
    syncAdminFieldControl(foreign, base)
    expect(foreign.values.get('aria-invalid')).toBe('true')
  })

  it('does nothing without a control', () => {
    const applied = { hintId: 'hint', invalid: true }
    expect(syncAdminFieldControl(null, base, applied)).toBe(applied)
  })
})
