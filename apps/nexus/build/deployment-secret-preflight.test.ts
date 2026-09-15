import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { PREVIEW_DEPLOY_ERROR_CODES, resolvePnpmInvocation, runPreviewDeployment } from './preview-deploy.mjs'
import {
  DEPLOYMENT_CREDENTIAL_NAMES,
  DEPLOYMENT_SECRET_ERROR_CODES,
  DEPLOYMENT_SECRET_EXIT_CODES,
  FEATURE_GATED_SECRET_NAMES,
  OPTIONAL_SECRET_NAMES,
  PRODUCTION_REQUIRED_SECRET_NAMES,
  assertCredentialBindings,
  assertSecretInventory,
  parseBindingMetadata,
  parseSecretNames,
  requiredNamesFor,
  runDeploymentSecretPreflight,
} from './deployment-secret-preflight.mjs'

const REQUIRED_SECRETS = [
  'ADMIN_CONTROL_PLANE_PEPPER',
  'ADMIN_EMERGENCY_JWT_SECRET',
  'APP_AUTH_JWT_SECRET',
  'AUTH_SECRET',
]

const PRODUCTION_REQUIRED_SECRETS = [
  'NOTIFICATION_SECURE_STORE_KEY',
  'NUXT_INTELLIGENCE_ENCRYPT_KEY',
  'PROVIDER_REGISTRY_SECURE_STORE_KEY',
]

const EXPECTED_CREDENTIALS = [
  'ADMIN_CF_ACCESS_CLIENT_SECRET',
  'ADMIN_CONTROL_PLANE_PEPPER',
  'ADMIN_EMERGENCY_JWT_SECRET',
  'ADMIN_SECRET',
  'ADMINSECRET',
  'APP_AUTH_JWT_SECRET',
  'AUTH_SECRET',
  'EXCHANGE_RATE_API_KEY',
  'GITHUB_CLIENT_SECRET',
  'LINUXDO_CLIENT_SECRET',
  'NOTIFICATION_SECURE_STORE_KEY',
  'NUXT_DOC_TOKEN_SECRET',
  'NUXT_INTELLIGENCE_ENCRYPT_KEY',
  'PLUGIN_ATTESTATION_PRIVATE_KEY_PEM',
  'PROVIDER_REGISTRY_SECURE_STORE_KEY',
  'RELEASE_DOWNLOAD_SIGNING_SECRET',
  'SENTRY_AUTH_TOKEN',
  'STORAGE_SECURE_STORE_KEY',
  'VOICE_PROVIDER_CATALOG_KEYS',
].sort()

function secretEnv(names: string[]) {
  return Object.fromEntries(names.map(name => [name, { type: 'secret_text', value: 'encrypted' }]))
}

/** A project whose production environment satisfies the gate, so preview stays the variable. */
function projectPayload(
  previewEnvVars: Record<string, unknown>,
  productionEnvVars: Record<string, unknown> = secretEnv([...REQUIRED_SECRETS, ...PRODUCTION_REQUIRED_SECRETS]),
) {
  return {
    success: true,
    result: {
      name: 'tuff',
      production_branch: 'master',
      deployment_configs: {
        production: { env_vars: productionEnvVars },
        preview: { env_vars: previewEnvVars },
      },
    },
  }
}

function runPreflight(payload: unknown, logger = { error: vi.fn(), log: vi.fn() }) {
  return runDeploymentSecretPreflight({
    env: { CLOUDFLARE_ACCOUNT_ID: 'account-id', CLOUDFLARE_API_TOKEN: 'api-token' },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }),
    logger,
  })
}

describe('deployment Secret preflight', () => {
  it('maintains the exact credential catalog without public configuration names', () => {
    expect(DEPLOYMENT_CREDENTIAL_NAMES).toEqual(EXPECTED_CREDENTIALS)
    for (const publicName of [
      'ADMIN_CF_ACCESS_CLIENT_ID',
      'AUTH_ORIGIN',
      'GITHUB_CLIENT_ID',
      'LINUXDO_CLIENT_ID',
      'NOTIFICATION_WEB_PUSH_PUBLIC_KEY',
      'PLUGIN_ATTESTATION_KEY_ID',
      'RELEASE_SIGNATURE_PUBLIC_KEY',
    ]) {
      expect(DEPLOYMENT_CREDENTIAL_NAMES).not.toContain(publicName)
    }
  })

  it('requires the encryption keys in production but not in preview', () => {
    expect(requiredNamesFor('preview')).toEqual(REQUIRED_SECRETS)
    expect(requiredNamesFor('production')).toEqual([...REQUIRED_SECRETS, ...PRODUCTION_REQUIRED_SECRETS].sort())

    // Its D1 table is empty and its only consumer already fails closed, so gating every deploy on
    // it would red-light releases for an unused feature.
    expect(PRODUCTION_REQUIRED_SECRET_NAMES).not.toContain('STORAGE_SECURE_STORE_KEY')
    expect(FEATURE_GATED_SECRET_NAMES).toContain('STORAGE_SECURE_STORE_KEY')
  })

  it('fails a production deployment that is missing an encryption key while preview is complete', async () => {
    // The real incident: production ran without NUXT_INTELLIGENCE_ENCRYPT_KEY and the gate stayed
    // green because it only ever read the preview environment.
    const payload = projectPayload(
      secretEnv(REQUIRED_SECRETS),
      secretEnv([...REQUIRED_SECRETS, 'NOTIFICATION_SECURE_STORE_KEY', 'PROVIDER_REGISTRY_SECURE_STORE_KEY']),
    )

    await expect(runPreflight(payload)).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.missingInventory,
      exitCode: DEPLOYMENT_SECRET_EXIT_CODES.missingInventory,
      environment: 'production',
      missingNames: ['NUXT_INTELLIGENCE_ENCRYPT_KEY'],
    })
  })

  it('does not require production-only names of preview', async () => {
    const result = await runPreflight(projectPayload(secretEnv(REQUIRED_SECRETS)))

    expect(result.environments.preview.required).toEqual(REQUIRED_SECRETS)
    expect(result.environments.production.required).toEqual(
      [...REQUIRED_SECRETS, ...PRODUCTION_REQUIRED_SECRETS].sort(),
    )
  })

  it('still fails when preview is missing a baseline name', async () => {
    await expect(runPreflight(projectPayload(secretEnv(['AUTH_SECRET'])))).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.missingInventory,
      environment: 'preview',
      missingNames: ['ADMIN_CONTROL_PLANE_PEPPER', 'ADMIN_EMERGENCY_JWT_SECRET', 'APP_AUTH_JWT_SECRET'],
    })
  })

  it('reports both environments in one run rather than one failure at a time', async () => {
    const payload = projectPayload(secretEnv(['AUTH_SECRET']), secretEnv(REQUIRED_SECRETS))

    await expect(runPreflight(payload)).rejects.toMatchObject({
      missingNames: [
        'ADMIN_CONTROL_PLANE_PEPPER',
        'ADMIN_EMERGENCY_JWT_SECRET',
        'APP_AUTH_JWT_SECRET',
        ...PRODUCTION_REQUIRED_SECRETS,
      ],
    })
  })

  it.each(['preview', 'production'] as const)('rejects the local-only marker in %s', async environment => {
    const payload = projectPayload(secretEnv([...REQUIRED_SECRETS]))
    const config = payload.result.deployment_configs[environment] as { env_vars: Record<string, unknown> }
    config.env_vars.NEXUS_LOCAL_PAGES_PREVIEW = { type: 'plain_text' }

    await expect(runPreflight(payload)).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.localMarkerConfigured,
      exitCode: DEPLOYMENT_SECRET_EXIT_CODES.localMarkerConfigured,
      environment,
    })
  })

  it('rejects a production credential bound as plain text', async () => {
    const payload = projectPayload(secretEnv(REQUIRED_SECRETS), {
      ...secretEnv([...REQUIRED_SECRETS, ...PRODUCTION_REQUIRED_SECRETS]),
      NUXT_INTELLIGENCE_ENCRYPT_KEY: { type: 'plain_text', value: 'exposed' },
    })

    await expect(runPreflight(payload)).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.invalidBindingType,
      environment: 'production',
      invalidTypeNames: ['NUXT_INTELLIGENCE_ENCRYPT_KEY'],
    })
  })

  it('extracts names only from the requested environment and only from secret_text', () => {
    const secretValue = 'must-never-be-read-or-logged'
    const secretBinding = { type: 'secret_text' } as Record<string, unknown>
    Object.defineProperty(secretBinding, 'value', {
      enumerable: true,
      get() {
        throw new Error(secretValue)
      },
    })

    const payload = projectPayload(
      {
        AUTH_SECRET: secretBinding,
        APP_AUTH_JWT_SECRET: { type: 'secret_text', value: secretValue },
        PLAIN_VALUE: { type: 'plain_text', value: secretValue },
      },
      { PRODUCTION_ONLY_SECRET: { type: 'secret_text', value: 'encrypted' } },
    )

    expect(parseSecretNames(payload, 'preview')).toEqual(['APP_AUTH_JWT_SECRET', 'AUTH_SECRET'])
    expect(parseSecretNames(payload, 'production')).toEqual(['PRODUCTION_ONLY_SECRET'])
  })

  it('treats an absent env_vars map as an empty inventory', () => {
    const payload = projectPayload({})
    delete (payload.result.deployment_configs.preview as { env_vars?: unknown }).env_vars

    expect(parseSecretNames(payload, 'preview')).toEqual([])
    expect(() => assertSecretInventory([], 'preview')).toThrowError(
      expect.objectContaining({ code: DEPLOYMENT_SECRET_ERROR_CODES.missingInventory }),
    )
  })

  it('reports configured feature-gated and optional bindings', () => {
    const bindings = parseBindingMetadata(
      projectPayload({
        ...secretEnv(REQUIRED_SECRETS),
        NUXT_INTELLIGENCE_ENCRYPT_KEY: { type: 'secret_text' },
        VOICE_PROVIDER_CATALOG_KEYS: { type: 'secret_text' },
        NUXT_DOC_TOKEN_SECRET: { type: 'secret_text' },
        AUTH_ORIGIN: { type: 'plain_text', value: 'https://preview.example.test' },
      }),
      'preview',
    )

    expect(assertCredentialBindings(bindings, 'preview')).toEqual({
      required: REQUIRED_SECRETS,
      environment: 'preview',
      featureGated: ['VOICE_PROVIDER_CATALOG_KEYS'],
      optional: ['NUXT_DOC_TOKEN_SECRET'],
    })
  })

  it('fails closed when the deploy branch is the Pages production branch', async () => {
    const payload = projectPayload(secretEnv(REQUIRED_SECRETS))
    payload.result.production_branch = 'preview'

    await expect(runPreflight(payload)).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.previewBranchInvalid,
      exitCode: DEPLOYMENT_SECRET_EXIT_CODES.previewBranchInvalid,
    })
  })

  it('fails closed when production branch metadata is absent', async () => {
    const payload = projectPayload(secretEnv(REQUIRED_SECRETS))
    delete (payload.result as { production_branch?: unknown }).production_branch

    await expect(runPreflight(payload)).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.productionBranchUnavailable,
      exitCode: DEPLOYMENT_SECRET_EXIT_CODES.productionBranchUnavailable,
    })
  })

  it('never emits API metadata values in success or failure output', async () => {
    const secretValue = 'sensitive-api-response-sentinel'
    const messages: string[] = []
    const logger = {
      error: vi.fn((message: string) => messages.push(message)),
      log: vi.fn((message: string) => messages.push(message)),
    }
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify(projectPayload({ AUTH_SECRET: { type: 'secret_text', value: secretValue } }))),
    )

    await expect(
      runDeploymentSecretPreflight({
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          CLOUDFLARE_API_TOKEN: 'api-token-sentinel',
          CLOUDFLARE_PAGES_PROJECT: 'tuff',
        },
        fetchImpl,
        logger,
      }),
    ).rejects.toMatchObject({ code: DEPLOYMENT_SECRET_ERROR_CODES.missingInventory })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/tuff',
      {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: 'Bearer api-token-sentinel' },
      },
    )

    const output = messages.join('\n')
    expect(output).not.toContain(secretValue)
    expect(output).not.toContain('api-token-sentinel')
  })

  it('does not read credential values while reporting invalid binding types', async () => {
    const sensitiveValue = 'plain-text-sentinel'
    const binding = { type: 'plain_text' } as Record<string, unknown>
    Object.defineProperty(binding, 'value', {
      enumerable: true,
      get() {
        throw new Error(sensitiveValue)
      },
    })

    const messages: string[] = []
    const logger = {
      error: vi.fn((message: string) => messages.push(message)),
      log: vi.fn((message: string) => messages.push(message)),
    }

    await expect(
      runPreflight(projectPayload({ ...secretEnv(REQUIRED_SECRETS), ADMINSECRET: binding }), logger),
    ).rejects.toMatchObject({
      code: DEPLOYMENT_SECRET_ERROR_CODES.invalidBindingType,
      invalidTypeNames: ['ADMINSECRET'],
    })

    expect(messages.join('\n')).not.toContain(sensitiveValue)
  })
})

describe('deployable configuration', () => {
  it('contains no credential-bearing Preview vars', () => {
    const source = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8')
    const previewVars = source.match(/\[env\.preview\.vars\]([\s\S]*?)(?=\n\[\[env\.preview\.|\n\[env\.|$)/)?.[1] ?? ''
    const credentialNames = [...DEPLOYMENT_CREDENTIAL_NAMES, 'NEXUS_LOCAL_PAGES_PREVIEW']

    for (const name of credentialNames) expect(previewVars).not.toMatch(new RegExp(`^${name}\\s*=`, 'm'))
  })

  it('documents the exact name-only inventory and optional binding semantics', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const setup = readFileSync(new URL('../SETUP.md', import.meta.url), 'utf8')
    const documentation = `${readme}\n${setup}`

    for (const name of REQUIRED_SECRETS) expect(documentation).toContain(name)
    for (const name of PRODUCTION_REQUIRED_SECRET_NAMES) expect(documentation).toContain(name)
    for (const name of FEATURE_GATED_SECRET_NAMES) expect(documentation).toContain(name)
    for (const name of OPTIONAL_SECRET_NAMES) expect(documentation).toContain(name)

    expect(documentation).toContain('feature-gated')
    expect(documentation).toContain('may be absent')
    expect(documentation).toContain('must use `secret_text`')
    expect(documentation).toContain('Cloudflare Dashboard')
    expect(documentation).not.toMatch(/wrangler\s+pages\s+secret\s+put[^\n]*--env\s+preview/i)
    expect(documentation).not.toContain('your_auth_secret')
    expect(documentation).not.toContain('replace-with-local-secret')
    expect(documentation).not.toContain('change-me-admin-emergency-jwt-secret')
  })

  it('documents every exit-78 error code in the alert issue body', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/nexus-deployment-secret-watch.yml', import.meta.url),
      'utf8',
    )

    // The workflow opens the drift issue on exit 78 only, so these are the codes an operator can
    // ever read there. Both sides are derived: a new 78 code, or a renamed one, fails here until
    // the operator-facing body explains it.
    const driftCodes = Object.keys(DEPLOYMENT_SECRET_EXIT_CODES)
      .filter(key => DEPLOYMENT_SECRET_EXIT_CODES[key as keyof typeof DEPLOYMENT_SECRET_EXIT_CODES] === 78)
      .map(key => DEPLOYMENT_SECRET_ERROR_CODES[key as keyof typeof DEPLOYMENT_SECRET_ERROR_CODES])
      .sort()

    const issueBody = workflow.match(/cat <<'([A-Z_]+)'\n([\s\S]*?)\n *\1\n/)?.[2] ?? ''
    expect(issueBody, 'alert issue body heredoc').not.toBe('')

    const documentedCodes = [
      ...new Set(
        [...issueBody.matchAll(/^ *- `((?:DEPLOYMENT|PREVIEW)_[A-Z0-9_]+)`/gm)].map(match => match[1]),
      ),
    ].sort()

    expect(documentedCodes).toEqual(driftCodes)
  })

  it('uses a fixed Preview deployment orchestrator', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

    expect(String(packageJson.scripts?.['deploy:cf'] ?? '')).toBe('node scripts/deploy-preview.mjs')
  })

  it('resolves native, JavaScript, and Windows pnpm entrypoints without parsing binaries as JavaScript', () => {
    expect(
      resolvePnpmInvocation({
        env: { npm_execpath: '/opt/pnpm/bin/pnpm' },
        platform: 'darwin',
        nodeExecutable: '/opt/node',
      }),
    ).toEqual({ executable: '/opt/pnpm/bin/pnpm', prefixArgs: [] })

    expect(
      resolvePnpmInvocation({
        env: { npm_execpath: '/opt/pnpm/pnpm.cjs' },
        platform: 'linux',
        nodeExecutable: '/opt/node',
      }),
    ).toEqual({ executable: '/opt/node', prefixArgs: ['/opt/pnpm/pnpm.cjs'] })

    expect(
      resolvePnpmInvocation({
        env: { npm_execpath: 'C:\\pnpm\\pnpm.cmd', ComSpec: 'C:\\Windows\\System32\\cmd.exe' },
        platform: 'win32',
        nodeExecutable: 'C:\\node\\node.exe',
      }),
    ).toEqual({
      executable: 'C:\\Windows\\System32\\cmd.exe',
      prefixArgs: ['/d', '/s', '/c', 'C:\\pnpm\\pnpm.cmd'],
    })
  })

  it('preflights before build and again before an exact Preview deployment', async () => {
    const calls: string[][] = []
    const preflight = vi.fn(async () => ({
      environments: { preview: { required: REQUIRED_SECRETS } },
      projectName: 'tuff',
      branch: 'preview',
    }))

    await runPreviewDeployment({ args: [], preflight, execute: commandArgs => calls.push(commandArgs) })

    expect(preflight).toHaveBeenCalledTimes(2)
    expect(calls).toEqual([
      ['run', 'build'],
      ['exec', 'wrangler', 'pages', 'deploy', 'dist', '--branch', 'preview', '--project-name', 'tuff'],
    ])
  })

  it('rejects command-line branch overrides before preflight or build', async () => {
    const preflight = vi.fn()
    const execute = vi.fn()

    await expect(runPreviewDeployment({ args: ['--branch', 'master'], preflight, execute })).rejects.toMatchObject({
      code: PREVIEW_DEPLOY_ERROR_CODES.argumentsUnsupported,
      exitCode: 64,
    })
    expect(preflight).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
