import { readFileSync } from 'node:fs'

/**
 * Cloudflare Pages credential preflight.
 *
 * This gate used to read only `deployment_configs.preview.env_vars`, and its required set happened
 * to be exactly the four names Preview had. It was therefore permanently green, and a production
 * deployment ran without `NUXT_INTELLIGENCE_ENCRYPT_KEY` for a long time without the gate noticing.
 * It now validates every deployment environment.
 */

const inventory = JSON.parse(
  readFileSync(new URL('../shared/security/deployment-secret-inventory.json', import.meta.url), 'utf8'),
)

function readInventoryNames(section) {
  const names = inventory[section]
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || name.trim() === '')) {
    throw new Error(`Invalid deployment credential inventory section: ${section}`)
  }
  return Object.freeze([...names].sort())
}

/** Required in every environment. */
export const REQUIRED_SECRET_NAMES = readInventoryNames('required')
/** Additionally required in production. */
export const PRODUCTION_REQUIRED_SECRET_NAMES = readInventoryNames('productionRequired')
export const FEATURE_GATED_SECRET_NAMES = readInventoryNames('featureGated')
export const OPTIONAL_SECRET_NAMES = readInventoryNames('optional')

export const DEPLOYMENT_CREDENTIAL_NAMES = Object.freeze(
  [
    ...REQUIRED_SECRET_NAMES,
    ...PRODUCTION_REQUIRED_SECRET_NAMES,
    ...FEATURE_GATED_SECRET_NAMES,
    ...OPTIONAL_SECRET_NAMES,
  ].sort(),
)

if (new Set(DEPLOYMENT_CREDENTIAL_NAMES).size !== DEPLOYMENT_CREDENTIAL_NAMES.length) {
  throw new Error('Deployment credential inventory names must belong to exactly one section.')
}

export const PREVIEW_DEPLOY_BRANCH = 'preview'
export const LOCAL_PREVIEW_MARKER_NAME = 'NEXUS_LOCAL_PAGES_PREVIEW'
export const DEPLOYMENT_ENVIRONMENTS = Object.freeze(['preview', 'production'])

export const DEPLOYMENT_SECRET_ERROR_CODES = Object.freeze({
  missingConfiguration: 'DEPLOYMENT_SECRET_PREFLIGHT_CONFIG_MISSING',
  metadataUnavailable: 'DEPLOYMENT_SECRET_METADATA_UNAVAILABLE',
  missingInventory: 'DEPLOYMENT_SECRET_INVENTORY_MISSING',
  invalidBindingType: 'DEPLOYMENT_SECRET_BINDING_TYPE_INVALID',
  localMarkerConfigured: 'DEPLOYMENT_LOCAL_MARKER_REMOTE_BINDING',
  productionBranchUnavailable: 'DEPLOYMENT_PRODUCTION_BRANCH_UNAVAILABLE',
  previewBranchInvalid: 'PREVIEW_DEPLOY_BRANCH_IS_PRODUCTION',
})

export const DEPLOYMENT_SECRET_EXIT_CODES = Object.freeze({
  missingConfiguration: 64,
  metadataUnavailable: 69,
  missingInventory: 78,
  invalidBindingType: 78,
  localMarkerConfigured: 78,
  productionBranchUnavailable: 69,
  previewBranchInvalid: 78,
})

export class DeploymentSecretPreflightError extends Error {
  constructor(code, message, options = {}) {
    super(`[${code}] ${message}`)
    this.name = 'DeploymentSecretPreflightError'
    this.code = code
    this.exitCode = options.exitCode ?? DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable
    this.missingNames = options.missingNames ?? []
    this.invalidTypeNames = options.invalidTypeNames ?? []
    this.environment = options.environment ?? null
    this.failures = options.failures ?? []
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function requiredNamesFor(environment) {
  return environment === 'production'
    ? Object.freeze([...REQUIRED_SECRET_NAMES, ...PRODUCTION_REQUIRED_SECRET_NAMES].sort())
    : REQUIRED_SECRET_NAMES
}

function readEnvironmentVariables(payload, environment) {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.result)) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
      'Cloudflare Pages project metadata was unavailable.',
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }

  const deploymentConfigs = payload.result.deployment_configs
  const config = isRecord(deploymentConfigs) ? deploymentConfigs[environment] : undefined
  if (!isRecord(config)) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
      `Cloudflare Pages ${environment} environment metadata was unavailable.`,
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable, environment },
    )
  }

  const envVars = config.env_vars
  if (envVars === undefined || envVars === null) return {}

  if (!isRecord(envVars)) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
      `Cloudflare Pages ${environment} environment metadata was unavailable.`,
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable, environment },
    )
  }

  return envVars
}

export function parseBindingMetadata(payload, environment) {
  const bindings = Object.entries(readEnvironmentVariables(payload, environment))
    .map(([name, binding]) => ({
      name,
      type: isRecord(binding) && typeof binding.type === 'string' ? binding.type : null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name))

  // A local marker leaking into production is strictly worse than into preview, so this applies to
  // every environment rather than preview alone.
  if (bindings.some(binding => binding.name === LOCAL_PREVIEW_MARKER_NAME)) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.localMarkerConfigured,
      `${LOCAL_PREVIEW_MARKER_NAME} is local-only and must not be configured in Cloudflare Pages ${environment}.`,
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.localMarkerConfigured, environment },
    )
  }

  return bindings
}

export function parseSecretNames(payload, environment) {
  return parseBindingMetadata(payload, environment)
    .filter(binding => binding.type === 'secret_text')
    .map(binding => binding.name)
}

export function parseProductionBranch(payload) {
  const productionBranch = isRecord(payload?.result) ? payload.result.production_branch : undefined
  if (typeof productionBranch !== 'string' || productionBranch.trim() === '') {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.productionBranchUnavailable,
      'Cloudflare Pages production branch metadata was unavailable.',
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.productionBranchUnavailable },
    )
  }
  return productionBranch
}

export function assertSecretInventory(secretNames, environment) {
  const available = new Set(secretNames)
  const required = requiredNamesFor(environment)
  const missingNames = required.filter(name => !available.has(name))
  if (missingNames.length > 0) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.missingInventory,
      `Missing required Cloudflare Pages ${environment} Secrets: ${missingNames.join(', ')}.`,
      {
        exitCode: DEPLOYMENT_SECRET_EXIT_CODES.missingInventory,
        missingNames,
        environment,
      },
    )
  }

  return { required: [...required] }
}

export function assertCredentialBindings(bindings, environment) {
  const bindingTypes = new Map(bindings.map(binding => [binding.name, binding.type]))
  const invalidTypeNames = DEPLOYMENT_CREDENTIAL_NAMES.filter(
    name => bindingTypes.has(name) && bindingTypes.get(name) !== 'secret_text',
  )

  if (invalidTypeNames.length > 0) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.invalidBindingType,
      `Credential-bearing ${environment} bindings must use secret_text: ${invalidTypeNames.join(', ')}.`,
      {
        exitCode: DEPLOYMENT_SECRET_EXIT_CODES.invalidBindingType,
        invalidTypeNames,
        environment,
      },
    )
  }

  const secretNames = bindings.filter(binding => binding.type === 'secret_text').map(binding => binding.name)
  const requiredResult = assertSecretInventory(secretNames, environment)

  return {
    ...requiredResult,
    environment,
    featureGated: FEATURE_GATED_SECRET_NAMES.filter(name => bindingTypes.has(name)),
    optional: OPTIONAL_SECRET_NAMES.filter(name => bindingTypes.has(name)),
  }
}

function requirePreflightEnvironment(env) {
  const missingNames = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'].filter(
    name => typeof env[name] !== 'string' || env[name].trim() === '',
  )
  if (missingNames.length > 0) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.missingConfiguration,
      `Missing preflight environment variables: ${missingNames.join(', ')}.`,
      {
        exitCode: DEPLOYMENT_SECRET_EXIT_CODES.missingConfiguration,
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

async function fetchProjectMetadata({ accountId, apiToken, projectName }, fetchImpl) {
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
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
      'Cloudflare Pages project metadata request failed.',
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }

  if (!response.ok) {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
      `Cloudflare Pages project metadata request failed with HTTP ${response.status}.`,
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }

  try {
    return await response.json()
  } catch {
    throw new DeploymentSecretPreflightError(
      DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
      'Cloudflare Pages project metadata response was invalid.',
      { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable },
    )
  }
}

export async function runDeploymentSecretPreflight({
  env = process.env,
  fetchImpl = globalThis.fetch,
  logger = console,
} = {}) {
  try {
    const config = requirePreflightEnvironment(env)
    const payload = await fetchProjectMetadata(config, fetchImpl)

    const productionBranch = parseProductionBranch(payload)
    if (productionBranch === PREVIEW_DEPLOY_BRANCH) {
      throw new DeploymentSecretPreflightError(
        DEPLOYMENT_SECRET_ERROR_CODES.previewBranchInvalid,
        `The deployment branch "${PREVIEW_DEPLOY_BRANCH}" is configured as the Pages production branch.`,
        { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.previewBranchInvalid },
      )
    }

    // Both environments are validated before throwing, so one run reports every problem rather
    // than making an operator rediscover the next one after each fix.
    const environments = {}
    const failures = []
    for (const environment of DEPLOYMENT_ENVIRONMENTS) {
      try {
        environments[environment] = assertCredentialBindings(
          parseBindingMetadata(payload, environment),
          environment,
        )
      } catch (error) {
        if (!(error instanceof DeploymentSecretPreflightError)) throw error
        failures.push(error)
      }
    }

    if (failures.length > 0) {
      const [first] = failures
      throw new DeploymentSecretPreflightError(
        first.code,
        failures.map(failure => failure.message).join(' '),
        {
          exitCode: first.exitCode,
          missingNames: failures.flatMap(failure => failure.missingNames),
          invalidTypeNames: failures.flatMap(failure => failure.invalidTypeNames),
          environment: first.environment,
          failures,
        },
      )
    }

    logger.log(
      `[DEPLOYMENT_SECRET_PREFLIGHT_OK] Verified ${DEPLOYMENT_ENVIRONMENTS.map(
        environment => `${environments[environment].required.length} required ${environment} Secret names`,
      ).join(' and ')}, and all configured credential binding types.`,
    )

    return {
      environments,
      projectName: config.projectName,
      branch: PREVIEW_DEPLOY_BRANCH,
    }
  } catch (error) {
    const safeError
      = error instanceof DeploymentSecretPreflightError
        ? error
        : new DeploymentSecretPreflightError(
            DEPLOYMENT_SECRET_ERROR_CODES.metadataUnavailable,
            'Cloudflare Pages deployment Secret preflight failed.',
            { exitCode: DEPLOYMENT_SECRET_EXIT_CODES.metadataUnavailable },
          )
    logger.error(safeError.message)
    throw safeError
  }
}
