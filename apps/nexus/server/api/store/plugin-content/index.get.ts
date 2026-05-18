import type {
  PluginContentListQuery,
  PluginContentStatus,
  PluginContentVisibility,
} from '@talex-touch/utils/types/cloud-share'
import { getQuery } from 'h3'
import { listPluginContentPackages } from '../../../utils/pluginContentStore'

const VISIBILITIES: PluginContentVisibility[] = ['private', 'unlisted', 'team', 'public']
const STATUSES: PluginContentStatus[] = ['draft', 'pending', 'published', 'rejected']

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string')
    return value
  if (Array.isArray(value) && typeof value[0] === 'string')
    return value[0]
  return undefined
}

function parseVisibility(value: unknown): PluginContentVisibility | undefined {
  const text = firstString(value)
  return VISIBILITIES.includes(text as PluginContentVisibility) ? text as PluginContentVisibility : undefined
}

function parseStatus(value: unknown): PluginContentStatus | undefined {
  const text = firstString(value)
  return STATUSES.includes(text as PluginContentStatus) ? text as PluginContentStatus : undefined
}

function parseNumber(value: unknown): number | undefined {
  const text = firstString(value)
  if (!text)
    return undefined
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const listQuery: PluginContentListQuery = {
    pluginId: firstString(query.pluginId),
    kind: firstString(query.kind),
    visibility: parseVisibility(query.visibility),
    status: parseStatus(query.status),
    limit: parseNumber(query.limit),
    offset: parseNumber(query.offset),
  }

  return listPluginContentPackages(event, listQuery)
})
