/**
 * PERMISSIONS registered i18n.read, lexicon.read and lexicon.register; PermissionIds did not, so
 * the PermissionId union could not express them. A plugin author writing
 * `const p: PermissionId = 'lexicon.register'` got a type error for a permission that
 * permissionRegistry.has() answers true for - forcing a cast, which is the one thing a constant
 * described as existing 'for type safety' must never require (#871).
 *
 * The union is *derived* from PermissionIds - `(typeof PermissionIds)[keyof typeof PermissionIds]` -
 * so pinning the runtime object against the registry pins the type by construction. There is no
 * type-level assertion here on purpose: packages/utils has no tsconfig covering __tests__, so one
 * would never be checked by anything and would only look like coverage.
 */
import { describe, expect, it } from 'vitest'

import { PERMISSIONS, PermissionIds, permissionRegistry } from '../permission/registry'

const REGISTERED = PERMISSIONS.map((permission) => permission.id)
const DECLARED = Object.values(PermissionIds) as string[]

describe('PermissionIds and the permission registry describe the same set', () => {
  it('注册表里的每一条都能被 PermissionIds 表达', () => {
    expect(REGISTERED.filter((id) => !DECLARED.includes(id))).toEqual([])
  })

  it('PermissionIds 里没有注册表不认识的条目(反向漂移同样是 bug)', () => {
    expect(DECLARED.filter((id) => !permissionRegistry.has(id))).toEqual([])
  })

  it('三条本地化权限现在有了常量,且注册表确实认识它们', () => {
    expect(PermissionIds.I18N_READ).toBe('i18n.read')
    expect(PermissionIds.LEXICON_READ).toBe('lexicon.read')
    expect(PermissionIds.LEXICON_REGISTER).toBe('lexicon.register')

    // The half that made the gap a defect rather than an omission: runtime already said yes.
    expect(permissionRegistry.has('lexicon.register')).toBe(true)
  })

  it('两边条目数相等(挡住"新增权限只加一边"这种漂移)', () => {
    expect(DECLARED).toHaveLength(REGISTERED.length)
  })

  it('检查确实在看真实数据:注册表非空,且不认识一个编造的 id', () => {
    expect(REGISTERED.length).toBeGreaterThan(20)
    expect(permissionRegistry.has('lexicon.definitely-not-a-permission')).toBe(false)
  })
})
