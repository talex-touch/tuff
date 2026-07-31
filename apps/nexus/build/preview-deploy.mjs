import { execFileSync } from 'node:child_process'
import { extname } from 'node:path'
import { PREVIEW_DEPLOY_BRANCH, runPreviewSecretPreflight } from './preview-secret-preflight.mjs'

export const PREVIEW_DEPLOY_ERROR_CODES = Object.freeze({
  argumentsUnsupported: 'PREVIEW_DEPLOY_ARGUMENTS_UNSUPPORTED',
  packageManagerUnavailable: 'PREVIEW_DEPLOY_PACKAGE_MANAGER_UNAVAILABLE',
  targetChanged: 'PREVIEW_DEPLOY_TARGET_CHANGED',
})

export class PreviewDeployError extends Error {
  constructor(code, message, exitCode) {
    super(`[${code}] ${message}`)
    this.name = 'PreviewDeployError'
    this.code = code
    this.exitCode = exitCode
  }
}

export function resolvePnpmInvocation({
  env = process.env,
  platform = process.platform,
  nodeExecutable = process.execPath,
} = {}) {
  const npmExecPath = typeof env.npm_execpath === 'string' ? env.npm_execpath.trim() : ''
  if (!npmExecPath) {
    throw new PreviewDeployError(
      PREVIEW_DEPLOY_ERROR_CODES.packageManagerUnavailable,
      'Run Preview deployment through the package manager script.',
      69,
    )
  }

  if (platform === 'win32' && /\.(?:cmd|bat)$/i.test(npmExecPath)) {
    const comSpec = String(env.ComSpec ?? env.COMSPEC ?? '').trim()
    if (!comSpec) {
      throw new PreviewDeployError(
        PREVIEW_DEPLOY_ERROR_CODES.packageManagerUnavailable,
        'Windows command processor is unavailable for Preview deployment.',
        69,
      )
    }
    return { executable: comSpec, prefixArgs: ['/d', '/s', '/c', npmExecPath] }
  }

  if (['.js', '.cjs', '.mjs'].includes(extname(npmExecPath).toLowerCase())) {
    return { executable: nodeExecutable, prefixArgs: [npmExecPath] }
  }

  return { executable: npmExecPath, prefixArgs: [] }
}

function runPnpm(args, env) {
  const { executable, prefixArgs } = resolvePnpmInvocation({ env })
  execFileSync(executable, [...prefixArgs, ...args], {
    env,
    stdio: 'inherit',
  })
}

export async function runPreviewDeployment({
  args = process.argv.slice(2),
  env = process.env,
  preflight = () => runPreviewSecretPreflight({ env }),
  execute = commandArgs => runPnpm(commandArgs, env),
} = {}) {
  if (args.length > 0) {
    throw new PreviewDeployError(
      PREVIEW_DEPLOY_ERROR_CODES.argumentsUnsupported,
      'Preview deployment does not accept command-line overrides.',
      64,
    )
  }

  const initial = await preflight()
  if (initial.branch !== PREVIEW_DEPLOY_BRANCH) {
    throw new PreviewDeployError(PREVIEW_DEPLOY_ERROR_CODES.targetChanged, 'Preview deployment target is invalid.', 78)
  }

  execute(['run', 'build'])

  const final = await preflight()
  if (final.projectName !== initial.projectName || final.branch !== PREVIEW_DEPLOY_BRANCH) {
    throw new PreviewDeployError(
      PREVIEW_DEPLOY_ERROR_CODES.targetChanged,
      'Preview deployment target changed after the build.',
      78,
    )
  }

  execute([
    'exec',
    'wrangler',
    'pages',
    'deploy',
    'dist',
    '--branch',
    PREVIEW_DEPLOY_BRANCH,
    '--project-name',
    final.projectName,
  ])
}
