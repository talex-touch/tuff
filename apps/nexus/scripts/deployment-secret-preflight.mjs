import { runDeploymentSecretPreflight } from '../build/deployment-secret-preflight.mjs'

try {
  await runDeploymentSecretPreflight()
} catch (error) {
  process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 69
}
