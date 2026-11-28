import { defineEventHandler } from 'h3'
import { assertPreviewRuntimeCredentials } from '../utils/previewRuntimeCredentials'

export default defineEventHandler((event) => {
  assertPreviewRuntimeCredentials(event)
})
