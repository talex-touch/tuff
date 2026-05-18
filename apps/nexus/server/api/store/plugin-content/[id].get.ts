import { createError } from 'h3'
import { getPluginContentPackage } from '../../../utils/pluginContentStore'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Plugin content package id is required.',
      data: { errorCode: 'PLUGIN_CONTENT_INVALID_PAYLOAD' },
    })
  }

  const item = await getPluginContentPackage(event, id)
  if (!item) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Plugin content package not found.',
      data: { errorCode: 'PLUGIN_CONTENT_NOT_FOUND' },
    })
  }

  return {
    package: item,
  }
})
