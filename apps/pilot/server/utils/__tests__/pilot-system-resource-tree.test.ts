import { describe, expect, it } from 'vitest'
import { buildTree } from '../pilot-system-resource'

describe('pilot-system-resource buildTree', () => {
  it('兼容嵌套 children 存储并恢复树结构', () => {
    const tree = buildTree([
      {
        id: 'menu_system',
        name: '系统管理',
        parentId: null,
        orderNo: 100,
        children: [
          {
            id: 'menu_system_user',
            name: '用户管理',
            parentId: 'menu_system',
            orderNo: 10,
          },
          {
            id: 'menu_system_role',
            name: '角色管理',
            parentId: 'menu_system',
            orderNo: 20,
          },
        ],
      },
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('menu_system')
    expect(tree[0].children).toHaveLength(2)
    expect(tree[0].children.map((item: any) => item.id)).toEqual([
      'menu_system_user',
      'menu_system_role',
    ])
  })

  it('兼容混合数据（嵌套 children + 扁平行）并按 parentId 归并', () => {
    const tree = buildTree([
      {
        id: 'dept_root',
        name: '平台',
        parentId: null,
        orderNo: 1,
        children: [
          {
            id: 'dept_ops',
            name: '运营',
            parentId: 'dept_root',
            orderNo: 10,
          },
        ],
      },
      {
        id: 'dept_engineering',
        name: '研发',
        parentId: 'dept_root',
        orderNo: 20,
      },
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe('dept_root')
    expect(tree[0].children.map((item: any) => item.id)).toEqual([
      'dept_ops',
      'dept_engineering',
    ])
  })
})
