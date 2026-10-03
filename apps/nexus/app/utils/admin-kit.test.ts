import { describe, expect, it } from 'vitest'
import { adminIdentityInitial, canConfirmAdminAction, resolveAdminIdentity, shouldShowAdminPager } from './admin-kit'

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
