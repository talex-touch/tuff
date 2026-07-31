import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { PREVIEW_DEPLOY_ERROR_CODES, resolvePnpmInvocation, runPreviewDeployment } from './preview-deploy.mjs'
import {
  FEATURE_GATED_PREVIEW_SECRET_NAMES,
  OPTIONAL_PREVIEW_SECRET_NAMES,
  PREVIEW_CREDENTIAL_NAMES,
  PREVIEW_SECRET_ERROR_CODES,
  PREVIEW_SECRET_EXIT_CODES,
  assertPreviewCredentialBindings,
  assertPreviewSecretInventory,
  parsePreviewBindingMetadata,
  parsePreviewSecretNames,
  runPreviewSecretPreflight,
} from './preview-secret-preflight.mjs'

const REQUIRED_PREVIEW_SECRETS = [
  'ADMIN_CONTROL_PLANE_PEPPER',
  'ADMIN_EMERGENCY_JWT_SECRET',
  'APP_AUTH_JWT_SECRET',
  'AUTH_SECRET',
]

const EXPECTED_PREVIEW_CREDENTIALS = [
  'ADMIN_CF_ACCESS_CLIENT_SECRET',
  'ADMIN_CONTROL_PLANE_PEPPER',
  'ADMIN_EMERGENCY_JWT_SECRET',
  'ADMIN_SECRET',
  'ADMINSECRET',
  'APP_AUTH_JWT_SECRET',
  'AUTH_EMAIL_SERVER',
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
  'RESEND_API_KEY',
  'SENTRY_AUTH_TOKEN',
  'STORAGE_SECURE_STORE_KEY',
  'TURNSTILE_SECRET_KEY',
  'TURNSTILE_SECRETKEY',
].sort()

function projectPayload(previewEnvVars: Record<string, unknown>) {
  return {
    success: true,
    result: {
      name: 'tuff',
      production_branch: 'master',
      deployment_configs: {
        production: {
          env_vars: {
            PRODUCTION_ONLY_SECRET: { type: 'secret_text', value: 'encrypted' },
          },
        },
        preview: {
          env_vars: previewEnvVars,
        },
      },
    },
  }
}

describe('Preview Secret deployment preflight', () => {
  it('maintains the exact credential catalog without public configuration names', () => {
    expect(PREVIEW_CREDENTIAL_NAMES).toEqual(EXPECTED_PREVIEW_CREDENTIALS)
    for (const publicName of [
      'ADMIN_CF_ACCESS_CLIENT_ID',
      'AUTH_ORIGIN',
      'GITHUB_CLIENT_ID',
      'LINUXDO_CLIENT_ID',
      'NOTIFICATION_WEB_PUSH_PUBLIC_KEY',
      'PLUGIN_ATTESTATION_KEY_ID',
      'RELEASE_SIGNATURE_PUBLIC_KEY',
      'TURNSTILE_SITEKEY',
    ]) {
      expect(PREVIEW_CREDENTIAL_NAMES).not.toContain(publicName)
    }
  })

  it('extracts names only from Preview secret_text metadata', () => {
    const secretValue = 'must-never-be-read-or-logged'
    const secretBinding = { type: 'secret_text' } as Record<string, unknown>
    Object.defineProperty(secretBinding, 'value', {
      enumerable: true,
      get() {
        throw new Error(secretValue)
      },
    })

    const names = parsePreviewSecretNames(
      projectPayload({
        AUTH_SECRET: secretBinding,
        APP_AUTH_JWT_SECRET: { type: 'secret_text', value: secretValue },
        PLAIN_VALUE: { type: 'plain_text', value: secretValue },
      }),
    )

    expect(names).toEqual(['APP_AUTH_JWT_SECRET', 'AUTH_SECRET'])
    expect(names).not.toContain('PRODUCTION_ONLY_SECRET')
  })

  it.each(['plain_text', 'secret_text'])(
    'rejects a remote local-only marker with a stable code when its type is %s',
    type => {
      const markerBinding = { type } as Record<string, unknown>
      Object.defineProperty(markerBinding, 'value', {
        enumerable: true,
        get() {
          throw new Error('local-marker-value-must-not-be-read')
        },
      })

      expect(() =>
        parsePreviewSecretNames(
          projectPayload({
            NEXUS_LOCAL_PAGES_PREVIEW: markerBinding,
          }),
        ),
      ).toThrowError(
        expect.objectContaining({
          code: PREVIEW_SECRET_ERROR_CODES.localMarkerConfigured,
          exitCode: PREVIEW_SECRET_EXIT_CODES.localMarkerConfigured,
        }),
      )
    },
  )

  it('treats an absent Preview env_vars map as an empty inventory', () => {
    const payload = projectPayload({})
    delete (payload.result.deployment_configs.preview as { env_vars?: unknown }).env_vars

    expect(parsePreviewSecretNames(payload)).toEqual([])
    expect(() => assertPreviewSecretInventory(parsePreviewSecretNames(payload))).toThrowError(
      expect.objectContaining({
        code: PREVIEW_SECRET_ERROR_CODES.missingInventory,
        exitCode: PREVIEW_SECRET_EXIT_CODES.missingInventory,
      }),
    )
  })

  it('accepts a complete required inventory', () => {
    expect(assertPreviewSecretInventory(REQUIRED_PREVIEW_SECRETS)).toEqual({
      required: REQUIRED_PREVIEW_SECRETS,
    })
  })

  it('rejects configured required, feature-gated, and optional credentials unless they are secret_text', () => {
    const sensitiveValue = 'wrong-binding-value-must-not-be-read'
    const plainCredential = { type: 'plain_text' } as Record<string, unknown>
    Object.defineProperty(plainCredential, 'value', {
      enumerable: true,
      get() {
        throw new Error(sensitiveValue)
      },
    })
    const bindings = parsePreviewBindingMetadata(
      projectPayload({
        ...Object.fromEntries(REQUIRED_PREVIEW_SECRETS.map(name => [name, { type: 'secret_text' }])),
        AUTH_SECRET: { type: 'plain_text', value: sensitiveValue },
        NUXT_INTELLIGENCE_ENCRYPT_KEY: plainCredential,
        RESEND_API_KEY: { type: 'plain_text', value: sensitiveValue },
      }),
    )

    expect(() => assertPreviewCredentialBindings(bindings)).toThrowError(
      expect.objectContaining({
        code: PREVIEW_SECRET_ERROR_CODES.invalidBindingType,
        exitCode: PREVIEW_SECRET_EXIT_CODES.invalidBindingType,
        invalidTypeNames: ['AUTH_SECRET', 'NUXT_INTELLIGENCE_ENCRYPT_KEY', 'RESEND_API_KEY'],
      }),
    )
  })

  it('accepts absent or secret_text optional credentials and unrelated plain_text variables', () => {
    const bindings = parsePreviewBindingMetadata(
      projectPayload({
        ...Object.fromEntries(REQUIRED_PREVIEW_SECRETS.map(name => [name, { type: 'secret_text' }])),
        NUXT_INTELLIGENCE_ENCRYPT_KEY: { type: 'secret_text' },
        RESEND_API_KEY: { type: 'secret_text' },
        AUTH_ORIGIN: { type: 'plain_text', value: 'https://preview.example.test' },
        GITHUB_CLIENT_ID: { type: 'plain_text', value: 'public-client-id' },
      }),
    )

    expect(assertPreviewCredentialBindings(bindings)).toEqual({
      required: REQUIRED_PREVIEW_SECRETS,
      featureGated: ['NUXT_INTELLIGENCE_ENCRYPT_KEY'],
      optional: ['RESEND_API_KEY'],
    })

    const requiredOnlyBindings = parsePreviewBindingMetadata(
      projectPayload(Object.fromEntries(REQUIRED_PREVIEW_SECRETS.map(name => [name, { type: 'secret_text' }]))),
    )
    expect(assertPreviewCredentialBindings(requiredOnlyBindings)).toEqual({
      required: REQUIRED_PREVIEW_SECRETS,
      featureGated: [],
      optional: [],
    })
  })

  it('fails closed with a stable code when required Preview names are missing', () => {
    expect(() => assertPreviewSecretInventory(['AUTH_SECRET'])).toThrowError(
      expect.objectContaining({
        code: PREVIEW_SECRET_ERROR_CODES.missingInventory,
        exitCode: PREVIEW_SECRET_EXIT_CODES.missingInventory,
        missingNames: ['ADMIN_CONTROL_PLANE_PEPPER', 'ADMIN_EMERGENCY_JWT_SECRET', 'APP_AUTH_JWT_SECRET'],
      }),
    )
  })

  it('fails closed when the deploy branch is the Pages production branch', async () => {
    const payload = projectPayload(
      Object.fromEntries(REQUIRED_PREVIEW_SECRETS.map(name => [name, { type: 'secret_text', value: 'encrypted' }])),
    )
    payload.result.production_branch = 'preview'

    await expect(
      runPreviewSecretPreflight({
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          CLOUDFLARE_API_TOKEN: 'api-token',
        },
        fetchImpl: async () => new Response(JSON.stringify(payload)),
        logger: { error: vi.fn(), log: vi.fn() },
      }),
    ).rejects.toMatchObject({
      code: PREVIEW_SECRET_ERROR_CODES.previewBranchInvalid,
      exitCode: PREVIEW_SECRET_EXIT_CODES.previewBranchInvalid,
    })
  })

  it('fails closed when production branch metadata is absent', async () => {
    const payload = projectPayload(
      Object.fromEntries(REQUIRED_PREVIEW_SECRETS.map(name => [name, { type: 'secret_text' }])),
    )
    delete (payload.result as { production_branch?: unknown }).production_branch

    await expect(
      runPreviewSecretPreflight({
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          CLOUDFLARE_API_TOKEN: 'api-token',
        },
        fetchImpl: async () => new Response(JSON.stringify(payload)),
        logger: { error: vi.fn(), log: vi.fn() },
      }),
    ).rejects.toMatchObject({
      code: PREVIEW_SECRET_ERROR_CODES.productionBranchUnavailable,
      exitCode: PREVIEW_SECRET_EXIT_CODES.productionBranchUnavailable,
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
        new Response(
          JSON.stringify(
            projectPayload({
              AUTH_SECRET: { type: 'secret_text', value: secretValue },
            }),
          ),
        ),
    )

    await expect(
      runPreviewSecretPreflight({
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          CLOUDFLARE_API_TOKEN: 'api-token-sentinel',
          CLOUDFLARE_PAGES_PROJECT: 'tuff',
        },
        fetchImpl,
        logger,
      }),
    ).rejects.toMatchObject({
      code: PREVIEW_SECRET_ERROR_CODES.missingInventory,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/accounts/account-id/pages/projects/tuff',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer api-token-sentinel',
        },
      },
    )

    const output = messages.join('\n')
    expect(output).not.toContain(secretValue)
    expect(output).not.toContain('api-token-sentinel')
  })

  it('does not read or log credential values while reporting invalid binding types', async () => {
    const sensitiveValue = 'optional-plain-text-sentinel'
    const optionalBinding = { type: 'plain_text' } as Record<string, unknown>
    Object.defineProperty(optionalBinding, 'value', {
      enumerable: true,
      get() {
        throw new Error(sensitiveValue)
      },
    })
    const payload = projectPayload({
      ...Object.fromEntries(REQUIRED_PREVIEW_SECRETS.map(name => [name, { type: 'secret_text' }])),
      AUTH_EMAIL_SERVER: optionalBinding,
    })
    const messages: string[] = []
    const logger = {
      error: vi.fn((message: string) => messages.push(message)),
      log: vi.fn((message: string) => messages.push(message)),
    }

    await expect(
      runPreviewSecretPreflight({
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'account-id',
          CLOUDFLARE_API_TOKEN: 'api-token',
        },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => payload,
        }),
        logger,
      }),
    ).rejects.toMatchObject({
      code: PREVIEW_SECRET_ERROR_CODES.invalidBindingType,
      invalidTypeNames: ['AUTH_EMAIL_SERVER'],
    })

    expect(messages).toEqual([
      '[PREVIEW_SECRET_BINDING_TYPE_INVALID] Credential-bearing Preview bindings must use secret_text: AUTH_EMAIL_SERVER.',
    ])
    expect(messages.join('\n')).not.toContain(sensitiveValue)
  })
})

describe('deployable Preview configuration', () => {
  it('contains no credential-bearing Preview vars', () => {
    const source = readFileSync(new URL('../../../wrangler.toml', import.meta.url), 'utf8')
    const previewVars = source.match(/\[env\.preview\.vars\]([\s\S]*?)(?=\n\[\[env\.preview\.|\n\[env\.|$)/)?.[1] ?? ''
    const credentialNames = [...PREVIEW_CREDENTIAL_NAMES, 'NEXUS_LOCAL_PAGES_PREVIEW']

    for (const name of credentialNames) expect(previewVars).not.toMatch(new RegExp(`^${name}\\s*=`, 'm'))
  })

  it('documents the exact name-only inventory and optional binding semantics', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const setup = readFileSync(new URL('../SETUP.md', import.meta.url), 'utf8')
    const documentation = `${readme}\n${setup}`

    for (const name of REQUIRED_PREVIEW_SECRETS) expect(documentation).toContain(name)
    for (const name of FEATURE_GATED_PREVIEW_SECRET_NAMES) expect(documentation).toContain(name)
    for (const name of OPTIONAL_PREVIEW_SECRET_NAMES) expect(documentation).toContain(name)

    expect(documentation).toContain('NUXT_INTELLIGENCE_ENCRYPT_KEY')
    expect(documentation).toContain('feature-gated')
    expect(documentation).toContain('may be absent')
    expect(documentation).toContain('must use `secret_text`')
    expect(documentation).toContain('Cloudflare Dashboard')
    expect(documentation).not.toMatch(/wrangler\s+pages\s+secret\s+put[^\n]*--env\s+preview/i)
    expect(documentation).not.toContain('accepts `--env preview`')
    expect(documentation).not.toContain('your_auth_secret')
    expect(documentation).not.toContain('replace-with-local-secret')
    expect(documentation).not.toContain('change-me-admin-emergency-jwt-secret')
  })

  it('uses a fixed Preview deployment orchestrator', () => {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const deployCommand = String(packageJson.scripts?.['deploy:cf'] ?? '')

    expect(deployCommand).toBe('node scripts/deploy-preview.mjs')
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
      required: REQUIRED_PREVIEW_SECRETS,
      projectName: 'tuff',
      branch: 'preview',
    }))

    await runPreviewDeployment({
      args: [],
      preflight,
      execute: commandArgs => calls.push(commandArgs),
    })

    expect(preflight).toHaveBeenCalledTimes(2)
    expect(calls).toEqual([
      ['run', 'build'],
      ['exec', 'wrangler', 'pages', 'deploy', 'dist', '--branch', 'preview', '--project-name', 'tuff'],
    ])
  })

  it('rejects command-line branch overrides before preflight or build', async () => {
    const preflight = vi.fn()
    const execute = vi.fn()

    await expect(
      runPreviewDeployment({
        args: ['--branch', 'master'],
        preflight,
        execute,
      }),
    ).rejects.toMatchObject({
      code: PREVIEW_DEPLOY_ERROR_CODES.argumentsUnsupported,
      exitCode: 64,
    })
    expect(preflight).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
})
