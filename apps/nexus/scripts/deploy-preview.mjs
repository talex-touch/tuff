import { runPreviewDeployment } from '../build/preview-deploy.mjs'

try {
  await runPreviewDeployment()
} catch (error) {
  if (error?.name === 'PreviewDeployError') console.error(error.message)
  else if (!Number.isInteger(error?.exitCode))
    console.error('[PREVIEW_DEPLOY_FAILED] Preview build or deployment failed.')

  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1
}
