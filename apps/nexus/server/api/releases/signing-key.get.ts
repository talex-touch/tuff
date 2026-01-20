import process from 'node:process'
import { setResponseHeader } from 'h3'
import { readCloudflareBindings } from '../../utils/cloudflare'

export default defineEventHandler(async (event) => {
  const bindings = readCloudflareBindings(event)
  const publicKey
    = bindings?.RELEASE_SIGNATURE_PUBLIC_KEY
      || bindings?.UPDATE_SIGNATURE_PUBLIC_KEY
      || process.env.RELEASE_SIGNATURE_PUBLIC_KEY
      || process.env.UPDATE_SIGNATURE_PUBLIC_KEY

  if (!publicKey) {
    return {
      publicKey: null,
      message: 'Release signature key not configured.',
    }
  }

  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return { publicKey }
})
