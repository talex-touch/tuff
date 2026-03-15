import type { H3Event } from 'h3'
import {
  deletePilotCompatEntity,
  getPilotCompatEntity,
  listPilotCompatEntities,
  listPilotCompatEntitiesAll,
  upsertPilotCompatEntity,
} from './pilot-compat-store'
import {
  ensureSystemDeptSeed,
  ensureSystemMenuSeed,
  ensureSystemRoleSeed,
} from './pilot-compat-seeds'

export type PilotSystemResource
  = 'users'
    | 'roles'
    | 'menus'
    | 'depts'
    | 'dict-type'
    | 'dict-item'
    | 'tasks'
    | 'param-config'

type SystemResourceConfig = {
  domain: string
  listMode: 'tree' | 'page'
  seed?: (event: H3Event) => Promise<void>
}

const RESOURCE_CONFIG_MAP: Record<PilotSystemResource, SystemResourceConfig> = {
  users: {
    domain: 'system.users',
    listMode: 'page',
  },
  roles: {
    domain: 'system.roles',
    listMode: 'page',
    seed: ensureSystemRoleSeed,
  },
  menus: {
    domain: 'system.menus',
    listMode: 'tree',
    seed: ensureSystemMenuSeed,
  },
  depts: {
    domain: 'system.depts',
    listMode: 'tree',
    seed: ensureSystemDeptSeed,
  },
  'dict-type': {
    domain: 'system.dict_type',
    listMode: 'page',
  },
  'dict-item': {
    domain: 'system.dict_item',
    listMode: 'page',
  },
  tasks: {
    domain: 'system.tasks',
    listMode: 'page',
  },
  'param-config': {
    domain: 'system.param_config',
    listMode: 'page',
  },
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function toResource(value: string): PilotSystemResource | null {
  const resource = normalizeText(value) as PilotSystemResource
  return RESOURCE_CONFIG_MAP[resource] ? resource : null
}

function buildTree(list: Array<Record<string, any>>): Array<Record<string, any>> {
  const mapped = list.map((item) => {
    const current: Record<string, any> = {
      ...item,
      children: [],
    }
    return current
  })
  const byId = new Map<string, Record<string, any>>()
  for (const item of mapped) {
    byId.set(normalizeText(item.id), item)
  }

  const roots: Array<Record<string, any>> = []
  for (const item of mapped) {
    const parentId = normalizeText(item.parentId)
    if (!parentId || parentId === '-1') {
      roots.push(item)
      continue
    }
    const parent = byId.get(parentId)
    if (!parent) {
      roots.push(item)
      continue
    }
    parent.children.push(item)
  }

  const sortNode = (nodes: Array<Record<string, any>>) => {
    nodes.sort((a, b) => Number(a.orderNo || 0) - Number(b.orderNo || 0))
    for (const node of nodes) {
      if (Array.isArray(node.children) && node.children.length > 0) {
        sortNode(node.children)
      }
    }
  }
  sortNode(roots)
  return roots
}

function normalizeResourcePayload(resource: PilotSystemResource, payload: Record<string, any>): Record<string, any> {
  const now = nowIso()
  const base: Record<string, any> = {
    ...payload,
    updatedAt: payload.updatedAt || now,
  }
  if (!base.createdAt) {
    base.createdAt = now
  }

  if (resource === 'users') {
    return {
      avatar: '',
      username: '',
      nickname: '',
      email: '',
      phone: '',
      qq: '',
      remark: '',
      status: 1,
      roleIds: [],
      roles: [],
      dept: null,
      ...base,
    }
  }
  if (resource === 'roles') {
    return {
      name: '',
      value: '',
      status: 1,
      remark: '',
      menuIds: [],
      menus: [],
      ...base,
    }
  }
  if (resource === 'menus') {
    return {
      name: '',
      type: 1,
      path: '',
      component: '',
      parentId: null,
      orderNo: 0,
      keepAlive: 1,
      show: 1,
      status: 1,
      permission: '',
      meta: {
        show: true,
        icon: '',
      },
      ...base,
    }
  }
  if (resource === 'depts') {
    return {
      name: '',
      parentId: null,
      orderNo: 0,
      status: 1,
      remark: '',
      ...base,
    }
  }
  if (resource === 'dict-type') {
    return {
      code: '',
      name: '',
      status: 1,
      remark: '',
      ...base,
    }
  }
  if (resource === 'dict-item') {
    return {
      typeId: '',
      label: '',
      value: '',
      orderNo: 0,
      status: 1,
      remark: '',
      ...base,
    }
  }
  if (resource === 'tasks') {
    return {
      name: '',
      service: '',
      cron: '',
      status: 1,
      type: 0,
      remark: '',
      ...base,
    }
  }
  return {
    name: '',
    key: '',
    value: '',
    status: 1,
    remark: '',
    ...base,
  }
}

async function ensureResourceSeed(event: H3Event, resource: PilotSystemResource): Promise<void> {
  const config = RESOURCE_CONFIG_MAP[resource]
  if (config.seed) {
    await config.seed(event)
  }
}

export function resolvePilotSystemResource(resource: string): PilotSystemResource | null {
  return toResource(resource)
}

export async function listPilotSystemResource(
  event: H3Event,
  resource: PilotSystemResource,
  query: Record<string, unknown>,
): Promise<any> {
  await ensureResourceSeed(event, resource)
  const config = RESOURCE_CONFIG_MAP[resource]
  if (config.listMode === 'tree') {
    const list = await listPilotCompatEntitiesAll<Record<string, any>>(event, config.domain)
    return buildTree(list)
  }
  return await listPilotCompatEntities(event, config.domain, {
    query,
  })
}

export async function getPilotSystemResourceById(
  event: H3Event,
  resource: PilotSystemResource,
  id: string,
): Promise<Record<string, any> | null> {
  await ensureResourceSeed(event, resource)
  return await getPilotCompatEntity(event, RESOURCE_CONFIG_MAP[resource].domain, id)
}

export async function createPilotSystemResource(
  event: H3Event,
  resource: PilotSystemResource,
  payload: Record<string, any>,
): Promise<Record<string, any>> {
  await ensureResourceSeed(event, resource)
  return await upsertPilotCompatEntity(event, {
    domain: RESOURCE_CONFIG_MAP[resource].domain,
    id: normalizeText(payload.id),
    payload: normalizeResourcePayload(resource, payload),
  })
}

export async function updatePilotSystemResource(
  event: H3Event,
  resource: PilotSystemResource,
  id: string,
  payload: Record<string, any>,
): Promise<Record<string, any>> {
  await ensureResourceSeed(event, resource)
  return await upsertPilotCompatEntity(event, {
    domain: RESOURCE_CONFIG_MAP[resource].domain,
    id,
    payload: normalizeResourcePayload(resource, payload),
  })
}

export async function deletePilotSystemResource(
  event: H3Event,
  resource: PilotSystemResource,
  id: string,
): Promise<boolean> {
  return await deletePilotCompatEntity(event, RESOURCE_CONFIG_MAP[resource].domain, id)
}

export async function searchSystemUsers(
  event: H3Event,
  query: string,
): Promise<[Array<Record<string, any>>, number]> {
  const keyword = normalizeText(query).toLowerCase()
  const list = await listPilotCompatEntitiesAll<Record<string, any>>(event, RESOURCE_CONFIG_MAP.users.domain)
  const items = !keyword
    ? list.slice(0, 20)
    : list
        .filter(item => JSON.stringify(item).toLowerCase().includes(keyword))
        .slice(0, 20)
  return [items, items.length]
}
