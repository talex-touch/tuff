import { runPreviewSecretPreflight } from '../build/preview-secret-preflight.mjs'

try {
  await runPreviewSecretPreflight()
} catch (error) {
  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 69
}
