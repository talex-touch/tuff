import { queryCollection } from '@nuxt/content/server'
import type { PolicyContentDocument, PolicyContentResponse } from '#shared/types/content-api'

/**
 * A policy page's document at a path, so it can be prerendered into a static file
 * (`contentApiPrerenderRoutes`) and served without the Worker. The query form
 * (`/api/content/policy?name=&locale=`) read the runtime content database on every SPA navigation
 * to a policy page.
 */
export default defineEventHandler(async (event): Promise<PolicyContentResponse> => {
  const name = String(getRouterParam(event, 'name') ?? '').trim().toLowerCase()
  const locale = String(getRouterParam(event, 'locale') ?? '').trim().toLowerCase() === 'zh' ? 'zh' : 'en'
  if (!/^[a-z0-9-]{1,80}$/.test(name))
    throw createError({ statusCode: 400, statusMessage: 'Invalid policy name.' })

  const localizedDoc = await queryCollection(event, 'app').path(`/app/${name}.${locale}`).first()
  const doc = localizedDoc ?? await queryCollection(event, 'app').path(`/app/${name}`).first()
  return { doc: doc as PolicyContentDocument | null }
})
