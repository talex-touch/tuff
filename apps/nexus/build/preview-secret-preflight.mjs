import { readFileSync } from 'node:fs'

const inventory = JSON.parse(
  readFileSync(new URL('../shared/security/preview-secret-inventory.json', import.meta.url), 'utf8'),
)

function readInventoryNames(section) {
  const names = inventory[section]
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || name.trim() === '')) {
    throw new Error(`Invalid Preview credential inventory section: ${section}`)
  }
  return Object.freeze([...names].sort())
}

export const REQUIRED_PREVIEW_SECRET_NAMES = readInventoryNames('required')
export const FEATURE_GATED_PREVIEW_SECRET_NAMES = readInventoryNames('featureGated')
export const OPTIONAL_PREVIEW_SECRET_NAMES = readInventoryNames('optional')
export const PREVIEW_CREDENTIAL_NAMES = Object.freeze(
  [...REQUIRED_PREVIEW_SECRET_NAMES, ...FEATURE_GATED_PREVIEW_SECRET_NAMES, ...OPTIONAL_PREVIEW_SECRET_NAMES].sort(),
)

if (new Set(PREVIEW_CREDENTIAL_NAMES).size !== PREVIEW_CREDENTIAL_NAMES.length) {
  throw new Error('Preview credential inventory names must belong to exactly one section.')
}

export const PREVIEW_DEPLOY_BRANCH = 'preview'
export const LOCAL_PREVIEW_MARKER_NAME = 'NEXUS_LOCAL_PAGES_PREVIEW'

export const PREVIEW_SECRET_ERROR_CODES = Object.freeze({
  missingConfiguration: 'PREVIEW_SECRET_PREFLIGHT_CONFIG_MISSING',
  metadataUnavailable: 'PREVIEW_SECRET_METADATA_UNAVAILABLE',
  missingInventory: 'PREVIEW_SECRET_INVENTORY_MISSING',
  invalidBindingType: 'PREVIEW_SECRET_BINDING_TYPE_INVALID',
  localMarkerConfigured: 'PREVIEW_LOCAL_MARKER_REMOTE_BINDING',
  productionBranchUnavailable: 'PREVIEW_PRODUCTION_BRANCH_UNAVAILABLE',
  previewBranchInvalid: 'PREVIEW_DEPLOY_BRANCH_IS_PRODUCTION',
})

export const PREVIEW_SECRET_EXIT_CODES = Object.freeze({
  missingConfiguration: 64,
  metadataUnavailable: 69,
  missingInventory: 78,
  invalidBindingType: 78,
  localMarkerConfigured: 78,
  productionBranchUnavailable: 69,
  previewBranchInvalid: 78,
})

export class PreviewSecretPreflightError extends Error {
  constructor(code, message, options = {}) {
    super(`[${code}] ${message}`)
    this.name = 'PreviewSecretPreflightError'
    this.code = code
    this.exitCode = options.exitCode ?? PREVIEW_SECRET_EXIT_CODES.metadataUnavailable
    this.missingNames = options.missingNames ?? []
    this.invalidTypeNames = options.invalidTypeNames ?? []
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readPreviewEnvironmentVariables(payload) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.result)) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
      'Cloudflare Pages project metadata was unavailable.',
      { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }

  const deploymentConfigs = payload.result.deployment_configs
  const preview = isRecord(deploymentConfigs) ? deploymentConfigs.preview : undefined
  if (!isRecord(preview)) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
      'Cloudflare Pages Preview environment metadata was unavailable.',
      { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }

  const envVars = preview.env_vars
  if (envVars === undefined || envVars === null) return {}

  if (!isRecord(envVars)) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
      'Cloudflare Pages Preview environment metadata was unavailable.',
      { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }

  return envVars
}

export function parsePreviewBindingMetadata(payload) {
  const bindings = Object.entries(readPreviewEnvironmentVariables(payload))
    .map(([name, binding]) => ({
      name,
      type: isRecord(binding) && typeof binding.type === 'string' ? binding.type : null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  if (bindings.some(binding => binding.name === LOCAL_PREVIEW_MARKER_NAME)) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.localMarkerConfigured,
      `${LOCAL_PREVIEW_MARKER_NAME} is local-only and must not be configured in Cloudflare Pages Preview.`,
      { exitCode: PREVIEW_SECRET_EXIT_CODES.localMarkerConfigured },
    )
  }

  return bindings
}

export function parsePreviewSecretNames(payload) {
  return parsePreviewBindingMetadata(payload)
    .filter(binding => binding.type === 'secret_text')
    .map(binding => binding.name)
}

export function parseProductionBranch(payload) {
  const productionBranch = isRecord(payload?.result) ? payload.result.production_branch : undefined
  if (typeof productionBranch !== 'string' || productionBranch.trim() === '') {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.productionBranchUnavailable,
      'Cloudflare Pages production branch metadata was unavailable.',
      { exitCode: PREVIEW_SECRET_EXIT_CODES.productionBranchUnavailable },
    )
  }
  return productionBranch
}

export function assertPreviewSecretInventory(secretNames) {
  const available = new Set(secretNames)
  const missingNames = REQUIRED_PREVIEW_SECRET_NAMES.filter(name => !available.has(name))
  if (missingNames.length > 0) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.missingInventory,
      `Missing required Cloudflare Pages Preview Secrets: ${missingNames.join(', ')}.`,
      {
        exitCode: PREVIEW_SECRET_EXIT_CODES.missingInventory,
        missingNames,
      },
    )
  }

  return { required: [...REQUIRED_PREVIEW_SECRET_NAMES] }
}

export function assertPreviewCredentialBindings(bindings) {
  const bindingTypes = new Map(bindings.map(binding => [binding.name, binding.type]))
  const invalidTypeNames = PREVIEW_CREDENTIAL_NAMES.filter(
    name => bindingTypes.has(name) && bindingTypes.get(name) !== 'secret_text',
  )

  if (invalidTypeNames.length > 0) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.invalidBindingType,
      `Credential-bearing Preview bindings must use secret_text: ${invalidTypeNames.join(', ')}.`,
      {
        exitCode: PREVIEW_SECRET_EXIT_CODES.invalidBindingType,
        invalidTypeNames,
      },
    )
  }

  const secretNames = bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.name)
  const requiredResult = assertPreviewSecretInventory(secretNames)

  return {
    ...requiredResult,
    featureGated: FEATURE_GATED_PREVIEW_SECRET_NAMES.filter(name => bindingTypes.has(name)),
    optional: OPTIONAL_PREVIEW_SECRET_NAMES.filter(name => bindingTypes.has(name)),
  }
}

function requirePreflightEnvironment(env) {
  const missingNames = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'].filter(
    name => typeof env[name] !== 'string' || env[name].trim() === '',
  )
  if (missingNames.length > 0) {
    throw new PreviewSecretPreflightError(
      PREVIEW_SECRET_ERROR_CODES.missingConfiguration,
      `Missing preflight environment variables: ${missingNames.join(', ')}.`,
      {
        exitCode: PREVIEW_SECRET_EXIT_CODES.missingConfiguration,
        missingNames,
      },
    )
  }

  return {
    accountId: env.CLOUDFLARE_ACCOUNT_ID.trim(),
    apiToken: env.CLOUDFLARE_API_TOKEN.trim(),
    projectName:
      typeof env.CLOUDFLARE_PAGES_PROJECT === 'string' && env.CLOUDFLARE_PAGES_PROJECT.trim()
        ? env.CLOUDFLARE_PAGES_PROJECT.trim()
        : 'tuff',
  }
}

export async function runPreviewSecretPreflight({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  try {
    const { accountId, apiToken, projectName } = requirePreflightEnvironment(env)
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/pages/projects/${encodeURIComponent(projectName)}`
    let response
    try {
      response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          Accept: 'application/json',
        },
      })
    } catch {
      throw new PreviewSecretPreflightError(
        PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
        'Cloudflare Pages project metadata request failed.',
        { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
      )
    }

    if (!response.ok) {
      throw new PreviewSecretPreflightError(
        PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
        `Cloudflare Pages project metadata request failed with HTTP ${response.status}.`,
        { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
      )
    }

    let payload
    try {
      payload = await response.json()
    } catch {
      throw new PreviewSecretPreflightError(
        PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
        'Cloudflare Pages project metadata response was invalid.',
        { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
      )
    }

    const bindings = parsePreviewBindingMetadata(payload)
    const productionBranch = parseProductionBranch(payload)
    if (productionBranch === PREVIEW_DEPLOY_BRANCH) {
      throw new PreviewSecretPreflightError(
        PREVIEW_SECRET_ERROR_CODES.previewBranchInvalid,
        `The deployment branch "${PREVIEW_DEPLOY_BRANCH}" is configured as the Pages production branch.`,
        { exitCode: PREVIEW_SECRET_EXIT_CODES.previewBranchInvalid },
      )
    }

    const inventoryResult = assertPreviewCredentialBindings(bindings)
    logger.log(
      `[PREVIEW_SECRET_PREFLIGHT_OK] Verified ${inventoryResult.required.length} required Preview Secret names and all configured credential binding types.`,
    )
    return {
      ...inventoryResult,
      projectName,
      branch: PREVIEW_DEPLOY_BRANCH,
    }
  } catch (error) {
    const safeError =
      error instanceof PreviewSecretPreflightError
        ? error
        : new PreviewSecretPreflightError(
            PREVIEW_SECRET_ERROR_CODES.metadataUnavailable,
            'Cloudflare Pages Preview Secret preflight failed.',
            { exitCode: PREVIEW_SECRET_EXIT_CODES.metadataUnavailable },
          )
    logger.error(safeError.message)
    throw safeError
  }
}
