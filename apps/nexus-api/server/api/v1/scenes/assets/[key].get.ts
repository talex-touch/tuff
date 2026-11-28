import { Buffer } from 'node:buffer'
import { createError, getRouterParam, send, setResponseHeader } from 'h3'
import { requireAuthOrApiKey } from '../../../../utils/auth'
import { requireSceneAsset } from '../../../../utils/sceneAssetStorage'

function readSceneAssetKey(event: Parameters<typeof getRouterParam>[0]): string {
  const key = String(getRouterParam(event, 'key') || '').trim()

  if (!key)
    throw createError({ statusCode: 400, statusMessage: 'Scene asset key is required.' })
  if (key.length > 260 || !/^scene_run_[a-z0-9._-]+\.[a-z0-9]{1,16}$/i.test(key) || key.includes('..'))
    throw createError({ statusCode: 400, statusMessage: 'Scene asset key is invalid.' })

  return key
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event)
  const key = readSceneAssetKey(event)

  const asset = await requireSceneAsset(event, key)

  // Until now the only barrier was knowing the key, and a key travels: referrers, shared links,
  // proxy and CDN logs. requireAuthOrApiKey with no scopes established that *someone* was
  // authenticated, never that it was this asset's owner (#898).
  //
  // 404 rather than 403 so a wrong answer does not confirm the key exists.
  //
  // An object with no recorded owner on a backend that records them predates this check, and is
  // refused for the same reason a mismatch is: there is nothing here that says the caller may
  // read it. Scene assets are run outputs rather than durable user data, so the cost of that is
  // a re-run.
  if (asset.storesOwnership && asset.ownerId !== userId) {
    throw createError({ statusCode: 404, statusMessage: 'Scene asset not found.' })
  }
  const buffer = Buffer.isBuffer(asset.data)
    ? asset.data
    : Buffer.from(asset.data)

  setResponseHeader(event, 'Content-Type', asset.contentType)
  setResponseHeader(event, 'Content-Length', buffer.length)
  setResponseHeader(event, 'X-Content-SHA256', asset.sha256)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=0, must-revalidate')

  return send(event, buffer)
})
