import { assertPreviewRuntimeCredentials } from '../utils/previewRuntimeCredentials'

export default defineEventHandler(event => {
  if (import.meta.prerender) return

  assertPreviewRuntimeCredentials(event)
})
