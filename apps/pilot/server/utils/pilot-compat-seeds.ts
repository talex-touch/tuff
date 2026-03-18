import type { H3Event } from 'h3'
import {
  ensurePilotCompatSeed,
  getPilotCompatEntity,
  upsertPilotCompatEntity,
} from './pilot-compat-store'

const now = () => new Date().toISOString()

type MenuSeedNode = Record<string, any> & {
  id: string
  children?: MenuSeedNode[]
}

function flattenMenuSeedTree(list: MenuSeedNode[]): MenuSeedNode[] {
  const rows: MenuSeedNode[] = []

  const visit = (item: MenuSeedNode, fallbackParentId: string | null = null) => {
    const id = String(item.id || '').trim()
    if (!id) {
      return
    }

    const { children, ...rest } = item
    rows.push({
      ...rest,
      id,
      parentId: item.parentId ?? fallbackParentId ?? null,
    })

    if (!Array.isArray(children) || children.length <= 0) {
      return
    }

    for (const child of children) {
      if (!child || typeof child !== 'object') {
        continue
      }
      visit(child as MenuSeedNode, id)
    }
  }

  for (const item of list) {
    if (!item || typeof item !== 'object') {
      continue
    }
    visit(item)
  }

  return rows
}

async function ensureSystemMenuBackfill(event: H3Event, seeds: MenuSeedNode[]): Promise<void> {
  const rows = flattenMenuSeedTree(seeds)
  for (const row of rows) {
    const id = String(row.id || '').trim()
    if (!id) {
      continue
    }

    const existing = await getPilotCompatEntity(event, 'system.menus', id)
    if (existing) {
      continue
    }

    const createdAt = String(row.createdAt || now())
    await upsertPilotCompatEntity(event, {
      domain: 'system.menus',
      id,
      payload: {
        ...row,
        id,
        createdAt,
        updatedAt: createdAt,
      },
      merge: false,
    })
  }
}

export async function ensureSystemRoleSeed(event: H3Event): Promise<void> {
  const createdAt = now()
  await ensurePilotCompatSeed(event, 'system.roles', [
    {
      id: 'role_admin',
      name: '管理员',
      value: 'admin',
      status: 1,
      remark: 'Pilot 管理员角色',
      menuIds: [],
      menus: [],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'role_user',
      name: '普通用户',
      value: 'user',
      status: 1,
      remark: 'Pilot 默认角色',
      menuIds: [],
      menus: [],
      createdAt,
      updatedAt: createdAt,
    },
  ])
}

export async function ensureSystemDeptSeed(event: H3Event): Promise<void> {
  const createdAt = now()
  await ensurePilotCompatSeed(event, 'system.depts', [
    {
      id: 'dept_root',
      name: '平台',
      parentId: null,
      status: 1,
      orderNo: 1,
      children: [
        {
          id: 'dept_ops',
          name: '运营',
          parentId: 'dept_root',
          status: 1,
          orderNo: 10,
          children: [],
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'dept_engineering',
          name: '研发',
          parentId: 'dept_root',
          status: 1,
          orderNo: 20,
          children: [],
          createdAt,
          updatedAt: createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
  ])
}

export async function ensureSystemMenuSeed(event: H3Event): Promise<void> {
  const createdAt = now()
  const menuSeeds: MenuSeedNode[] = [
    {
      id: 'menu_system',
      name: '系统管理',
      type: 0,
      orderNo: 100,
      path: '/system',
      component: '',
      parentId: null,
      keepAlive: 1,
      show: 1,
      status: 1,
      meta: {
        show: true,
        icon: 'i-carbon-settings-adjust',
      },
      children: [
        {
          id: 'menu_system_user',
          name: '用户管理',
          type: 1,
          orderNo: 10,
          path: '/system/user',
          component: '/pages/admin/system/user.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-user-multiple',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_system_role',
          name: '角色管理',
          type: 1,
          orderNo: 20,
          path: '/system/role',
          component: '/pages/admin/system/role.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-user-role',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_system_menu',
          name: '菜单管理',
          type: 1,
          orderNo: 30,
          path: '/system/menu',
          component: '/pages/admin/system/menu.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-menu',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_system_dict_type',
          name: '字典类型',
          type: 1,
          orderNo: 50,
          path: '/system/dict-type',
          component: '/pages/admin/system/dict-type.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-catalog',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_system_dict_item',
          name: '字典项',
          type: 1,
          orderNo: 60,
          path: '/system/dict-item',
          component: '/pages/admin/system/dict-item.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-list',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_system_orders',
          name: '订单管理',
          type: 1,
          orderNo: 70,
          path: '/system/orders',
          component: '/pages/admin/system/orders.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-purchase',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_system_coupon',
          name: '券码管理',
          type: 1,
          orderNo: 80,
          path: '/system/coupon',
          component: '/pages/admin/system/coupon.vue',
          parentId: 'menu_system',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-ticket',
          },
          createdAt,
          updatedAt: createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'menu_content',
      name: '内容运营',
      type: 0,
      orderNo: 80,
      path: '/content',
      component: '',
      parentId: null,
      keepAlive: 1,
      show: 1,
      status: 1,
      meta: {
        show: true,
        icon: 'i-carbon-content-view',
      },
      children: [
        {
          id: 'menu_content_doc',
          name: '文档管理',
          type: 1,
          orderNo: 10,
          path: '/content/doc',
          component: '/pages/admin/content/document.vue',
          parentId: 'menu_content',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-document',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_content_banner',
          name: 'Banner 管理',
          type: 1,
          orderNo: 20,
          path: '/content/banner',
          component: '/pages/admin/content/banner.vue',
          parentId: 'menu_content',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-image',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_content_feedback',
          name: '反馈管理',
          type: 1,
          orderNo: 30,
          path: '/system/feedbackManage',
          component: '/pages/admin/system/feedbackManage.vue',
          parentId: 'menu_content',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-chat',
          },
          createdAt,
          updatedAt: createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'menu_app',
      name: 'App 管理',
      type: 0,
      orderNo: 70,
      path: '/app',
      component: '',
      parentId: null,
      keepAlive: 1,
      show: 1,
      status: 1,
      meta: {
        show: true,
        icon: 'i-carbon-application',
      },
      children: [
        {
          id: 'menu_app_channels',
          name: 'Channels',
          type: 1,
          orderNo: 10,
          path: '/system/channels',
          component: '/pages/admin/system/channels.vue',
          parentId: 'menu_app',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-settings-adjust',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_app_storage',
          name: 'Storage',
          type: 1,
          orderNo: 20,
          path: '/system/storage',
          component: '/pages/admin/system/storage.vue',
          parentId: 'menu_app',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-document',
          },
          createdAt,
          updatedAt: createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'menu_aigc',
      name: 'AIGC 管理',
      type: 0,
      orderNo: 60,
      path: '/aigc',
      component: '',
      parentId: null,
      keepAlive: 1,
      show: 1,
      status: 1,
      meta: {
        show: true,
        icon: 'i-carbon-ai-status',
      },
      children: [
        {
          id: 'menu_aigc_prompt',
          name: 'Prompt 管理',
          type: 1,
          orderNo: 10,
          path: '/aigc/prompt',
          component: '/pages/admin/aigc/prompt.vue',
          parentId: 'menu_aigc',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-code',
          },
          createdAt,
          updatedAt: createdAt,
        },
        {
          id: 'menu_aigc_log',
          name: '流量监控',
          type: 1,
          orderNo: 20,
          path: '/aigc/log',
          component: '/pages/admin/aigc/log.vue',
          parentId: 'menu_aigc',
          keepAlive: 1,
          show: 1,
          status: 1,
          meta: {
            show: true,
            icon: 'i-carbon-chart-line',
          },
          createdAt,
          updatedAt: createdAt,
        },
      ],
      createdAt,
      updatedAt: createdAt,
    },
  ]

  await ensurePilotCompatSeed(event, 'system.menus', menuSeeds)
  await ensureSystemMenuBackfill(event, menuSeeds)
}

export async function ensureAccountHistorySeed(event: H3Event): Promise<void> {
  const createdAt = now()
  await ensurePilotCompatSeed(event, 'account.login_histories', [
    {
      id: 'history_init',
      ip: '127.0.0.1',
      address: 'Local',
      os: 'macOS',
      browser: 'Chrome 120',
      provider: 'WEB_AP',
      time: createdAt,
      createdAt,
      updatedAt: createdAt,
    },
  ])
}

export async function ensureSubscribePlanSeed(event: H3Event): Promise<void> {
  const createdAt = now()
  await ensurePilotCompatSeed(event, 'subscribe.plans', [
    {
      id: 'plan_standard_month',
      name: '标准订阅计划（月）',
      type: 'STANDARD',
      time: 'MONTH',
      price: 2999,
      status: 1,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'plan_ultimate_month',
      name: '高级订阅计划（月）',
      type: 'ULTIMATE',
      time: 'MONTH',
      price: 9999,
      status: 1,
      createdAt,
      updatedAt: createdAt,
    },
  ])
}
