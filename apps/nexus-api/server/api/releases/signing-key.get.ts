import process from 'node:process'
import { setResponseHeader } from 'h3'
import { readCloudflareBindings } from '../../utils/cloudflare'
import { DEFAULT_RELEASE_SIGNATURE_PUBLIC_KEY } from '../../utils/releaseSigningPublicKey.mjs'

export default defineEventHandler(async (event) => {
  const bindings = readCloudflareBindings(event)
  const publicKey
    = bindings?.RELEASE_SIGNATURE_PUBLIC_KEY
      || bindings?.UPDATE_SIGNATURE_PUBLIC_KEY
      || process.env.RELEASE_SIGNATURE_PUBLIC_KEY
      || process.env.UPDATE_SIGNATURE_PUBLIC_KEY
      || DEFAULT_RELEASE_SIGNATURE_PUBLIC_KEY

  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')
  return { publicKey }
})
