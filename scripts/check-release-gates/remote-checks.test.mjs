import assert from 'node:assert/strict'
import { afterEach, describe, it, vi } from 'vitest'
import { checkRemoteRelease } from './remote-checks.mjs'

const tag = 'v2.4.12-beta.8'
const baseUrl = 'https://tuff.example.test'
const signedDownloadSig = 'd'.repeat(64)

function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

function buildManifest(overrides = {}) {
  return {
    schemaVersion: 1,
    release: {
      version: '2.4.12-beta.8',
      channel: 'BETA',
      tag,
    },
    artifacts: [
      {
        component: 'core',
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        platform: 'win32',
        arch: 'x64',
        sha256: 'a'.repeat(64),
        signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
      },
      {
        component: 'core',
        name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
        platform: 'darwin',
        arch: 'arm64',
        sha256: 'b'.repeat(64),
        signature: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
      },
    ],
    ...overrides,
  }
}

function buildRemoteRelease({ assets }) {
  return {
    release: {
      tag,
      version: '2.4.12-beta.8',
      channel: 'BETA',
      status: 'published',
      notes: {
        zh: '发版说明',
        en: 'Release notes',
      },
      notesHtml: {
        zh: '<p>发版说明</p>',
        en: '<p>Release notes</p>',
      },
      assets,
    },
  }
}

function buildAssets(overrides = {}) {
  return [
    {
      platform: 'win32',
      arch: 'x64',
      filename: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
      downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=1700000000&sig=${signedDownloadSig}`,
      sha256: 'a'.repeat(64),
      signatureUrl: `${baseUrl}/api/releases/${tag}/signature/win32/x64`,
      ...overrides.win32,
    },
    {
      platform: 'darwin',
      arch: 'arm64',
      filename: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
      downloadUrl: `/api/releases/${tag}/download/darwin/arm64?exp=1700000000&sig=${signedDownloadSig}`,
      sha256: 'b'.repeat(64),
      signatureUrl: `${baseUrl}/api/releases/${tag}/signature/darwin/arm64`,
      ...overrides.darwin,
    },
  ]
}

function installReleaseFetchMock({
  assets = buildAssets(),
  manifest = buildManifest(),
  signatureResponses = {},
  downloadResponses = {},
} = {}) {
  const githubReleaseUrl = `https://api.github.com/repos/talex-touch/tuff/releases/tags/${tag}`
  const manifestUrl = `https://github.example.test/${tag}/tuff-release-manifest.json`
  const releaseUrl = `${baseUrl}/api/releases/${tag}?assets=true`
  const latestUrl = `${baseUrl}/api/releases/latest?channel=BETA`

  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const textUrl = String(url)
    if (textUrl === releaseUrl)
      return createJsonResponse(buildRemoteRelease({ assets }))
    if (textUrl === githubReleaseUrl) {
      return createJsonResponse({
        assets: [
          {
            name: 'tuff-release-manifest.json',
            browser_download_url: manifestUrl,
          },
        ],
      })
    }
    if (textUrl === manifestUrl)
      return createJsonResponse(manifest)
    if (textUrl.startsWith(`${baseUrl}/api/releases/${tag}/signature/`)) {
      const path = new URL(textUrl).pathname
      const pair = path.split('/').slice(-2).join('/')
      const override = signatureResponses[pair] ?? signatureResponses.default
      if (override instanceof Response)
        return override
      if (override) {
        return new Response(override.body ?? '-----BEGIN PGP SIGNATURE-----\nvalid\n-----END PGP SIGNATURE-----', {
          status: override.status ?? 200,
          headers: override.headers ?? {
            'Content-Type': 'application/octet-stream',
          },
        })
      }
      return new Response('-----BEGIN PGP SIGNATURE-----\nvalid\n-----END PGP SIGNATURE-----', {
        status: 200,
        headers: {
          'Content-Type': 'application/pgp-signature',
        },
      })
    }
    if (textUrl.startsWith(`${baseUrl}/api/releases/${tag}/download/`)) {
      const path = new URL(textUrl).pathname
      const pair = path.split('/').slice(-2).join('/')
      const override = downloadResponses[pair] ?? downloadResponses.default
      if (override instanceof Response)
        return override
      if (override) {
        return new Response(override.body ?? '', {
          status: override.status ?? 302,
          headers: override.headers ?? {
            Location: 'https://github.example.test/releases/download/artifact',
          },
        })
      }
      return new Response('', {
        status: 302,
        headers: {
          Location: 'https://github.example.test/releases/download/artifact',
        },
      })
    }
    if (textUrl === latestUrl)
      return createJsonResponse({ release: { tag } })
    return createJsonResponse({ error: 'not found', url: textUrl }, 404)
  }))
}

async function runCheck(options = {}) {
  const checks = []
  await checkRemoteRelease({
    baseUrlValue: baseUrl,
    tag,
    stage: options.stage ?? 'gate-e',
    timeoutMs: 1000,
    pushCheck(name, status, detail, meta = {}) {
      checks.push({ name, status, detail, ...meta })
    },
  })
  return checks
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('check-release-gates remote checks', () => {
  it('passes when Nexus release assets match the GitHub release manifest matrix', async () => {
    installReleaseFetchMock()

    const checks = await runCheck()

    assert.equal(checks.find(item => item.name === 'remote-manifest-asset')?.status, 'pass')
    assert.equal(checks.find(item => item.name === 'remote-manifest-integrity')?.status, 'pass')
    assert.equal(checks.find(item => item.name === 'remote-manifest-nexus-matrix')?.status, 'pass')
    assert.equal(checks.find(item => item.name === 'remote-asset-integrity')?.status, 'pass')
    assert.equal(checks.find(item => item.name === 'remote-download-endpoint')?.status, 'pass')
    assert.equal(
      checks
        .find(item => item.name === 'remote-download-endpoint')
        ?.results.every(item => item.hasExp && item.hasValidSig),
      true
    )
  })

  it('fails gate-e when Nexus asset filename or sha256 drifts from the GitHub manifest', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          filename: 'tuff-core-2.4.12-beta.8-win32-x64-portable.exe',
        },
        darwin: {
          sha256: 'c'.repeat(64),
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(item => item.name === 'remote-manifest-nexus-matrix')

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason).sort(),
      ['filename-mismatch', 'sha256-mismatch']
    )
  })

  it('fails gate-e when a Nexus asset exposes a malformed sha256 value', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          sha256: 'not-a-valid-sha256',
        },
      }),
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(item => item.name === 'remote-asset-integrity')

    assert.equal(integrityCheck?.status, 'fail')
    assert.deepEqual(integrityCheck?.missing, [
      {
        platform: 'win32',
        arch: 'x64',
        filename: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        hasSha256: true,
        hasValidSha256: false,
        hasSignatureUrl: true,
      },
    ])
  })

  it('fails gate-e when Nexus exposes duplicate platform/arch assets', async () => {
    const assets = buildAssets()
    installReleaseFetchMock({
      assets: [
        ...assets,
        {
          ...assets[0],
          filename: 'tuff-core-2.4.12-beta.8-win32-x64-duplicate.exe',
        },
      ],
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(item => item.name === 'remote-manifest-nexus-matrix')

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason),
      ['duplicate-nexus-asset']
    )
    assert.equal(matrixCheck?.mismatches[0]?.key, 'win32/x64')
  })

  it('fails gate-e when Nexus asset signatureUrl does not point at the release signature endpoint', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          signatureUrl: 'https://cdn.example.test/tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(item => item.name === 'remote-manifest-nexus-matrix')

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason),
      ['signature-url-mismatch']
    )
    assert.equal(
      matrixCheck?.mismatches[0]?.expected,
      `/api/releases/${tag}/signature/win32/x64`
    )
  })

  it('fails gate-e when the signature endpoint returns an empty payload', async () => {
    installReleaseFetchMock({
      signatureResponses: {
        'win32/x64': {
          body: '',
        },
      },
    })

    const checks = await runCheck()
    const signatureCheck = checks.find(item => item.name === 'remote-signature-endpoint')

    assert.equal(signatureCheck?.status, 'fail')
    assert.deepEqual(
      signatureCheck?.results.find(item => item.platform === 'win32' && item.arch === 'x64'),
      {
        platform: 'win32',
        arch: 'x64',
        status: 200,
        validPayload: false,
        valid: false,
        reason: 'empty-signature-body',
        byteLength: 0,
        contentType: 'application/octet-stream',
        kind: 'empty',
      }
    )
  })

  it('fails gate-e when the signature endpoint returns a JSON error payload', async () => {
    installReleaseFetchMock({
      signatureResponses: {
        'darwin/arm64': {
          body: JSON.stringify({ error: 'signature missing' }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      },
    })

    const checks = await runCheck()
    const signatureCheck = checks.find(item => item.name === 'remote-signature-endpoint')

    assert.equal(signatureCheck?.status, 'fail')
    assert.equal(
      signatureCheck?.results.find(item => item.platform === 'darwin' && item.arch === 'arm64')?.reason,
      'json-signature-body'
    )
  })

  it('fails gate-e when Nexus asset downloadUrl does not point at the signed release download endpoint', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl: 'https://github.example.test/releases/tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(item => item.name === 'remote-manifest-nexus-matrix')

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason),
      ['download-url-mismatch']
    )
    assert.equal(
      matrixCheck?.mismatches[0]?.expected,
      `/api/releases/${tag}/download/win32/x64`
    )
  })

  it('fails gate-e when a Nexus asset downloadUrl is missing the signed query', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64`,
        },
      }),
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(item => item.name === 'remote-download-endpoint')

    assert.equal(downloadCheck?.status, 'fail')
    assert.deepEqual(
      downloadCheck?.results.find(item => item.platform === 'win32' && item.arch === 'x64'),
      {
        platform: 'win32',
        arch: 'x64',
        status: 302,
        url: `${baseUrl}/api/releases/${tag}/download/win32/x64`,
        sameOrigin: true,
        path: `/api/releases/${tag}/download/win32/x64`,
        hasExp: false,
        hasSig: false,
        hasValidSig: false,
        validResponse: true,
        responseKind: 'redirect',
        location: 'https://github.example.test/releases/download/artifact',
      }
    )
  })

  it('fails gate-e when a Nexus asset downloadUrl uses a malformed signature query', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        darwin: {
          downloadUrl: `/api/releases/${tag}/download/darwin/arm64?exp=1700000000&sig=not-a-valid-signature`,
        },
      }),
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(item => item.name === 'remote-download-endpoint')

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(
      downloadCheck?.results.find(item => item.platform === 'darwin' && item.arch === 'arm64')?.hasValidSig,
      false
    )
  })

  it('fails gate-e when the signed download endpoint redirects without a Location header', async () => {
    installReleaseFetchMock({
      downloadResponses: {
        'win32/x64': new Response('', { status: 302 }),
      },
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(item => item.name === 'remote-download-endpoint')

    assert.equal(downloadCheck?.status, 'fail')
    assert.deepEqual(
      downloadCheck?.results.find(item => item.platform === 'win32' && item.arch === 'x64'),
      {
        platform: 'win32',
        arch: 'x64',
        status: 302,
        url: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=1700000000&sig=${signedDownloadSig}`,
        sameOrigin: true,
        path: `/api/releases/${tag}/download/win32/x64`,
        hasExp: true,
        hasSig: true,
        hasValidSig: true,
        exp: '1700000000',
        validResponse: false,
        responseKind: 'redirect',
        location: null,
        reason: 'missing-redirect-location',
      }
    )
  })

  it('fails gate-e when the signed download endpoint returns a JSON body', async () => {
    installReleaseFetchMock({
      downloadResponses: {
        'darwin/arm64': {
          status: 200,
          body: JSON.stringify({ error: 'asset missing' }),
          headers: {
            'Content-Type': 'application/json',
          },
        },
      },
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(item => item.name === 'remote-download-endpoint')

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(
      downloadCheck?.results.find(item => item.platform === 'darwin' && item.arch === 'arm64')?.reason,
      'json-download-body'
    )
  })

  it('fails gate-e when the GitHub manifest signature sidecar does not match the artifact name', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        artifacts: [
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
            platform: 'win32',
            arch: 'x64',
            sha256: 'a'.repeat(64),
            signature: 'wrong-sidecar.sig',
          },
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
            platform: 'darwin',
            arch: 'arm64',
            sha256: 'b'.repeat(64),
            signature: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
          },
        ],
      }),
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(item => item.name === 'remote-manifest-integrity')

    assert.equal(integrityCheck?.status, 'fail')
    assert.deepEqual(integrityCheck?.issues, [
      'artifacts[0].signature must point to the artifact .sig/.asc sidecar',
    ])
  })

  it('fails gate-e when the GitHub manifest reuses artifact sha256 values', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        artifacts: [
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
            platform: 'win32',
            arch: 'x64',
            sha256: 'a'.repeat(64),
            signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
          },
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
            platform: 'darwin',
            arch: 'arm64',
            sha256: 'a'.repeat(64).toUpperCase(),
            signature: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
          },
        ],
      }),
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(item => item.name === 'remote-manifest-integrity')

    assert.equal(integrityCheck?.status, 'fail')
    assert.deepEqual(integrityCheck?.issues, ['artifacts[1].sha256 must be unique'])
  })

  it('fails gate-e when the GitHub manifest lists a signature sidecar as an artifact', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        artifacts: [
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
            platform: 'win32',
            arch: 'x64',
            sha256: 'a'.repeat(64),
            signature: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
          },
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
            platform: 'darwin',
            arch: 'arm64',
            sha256: 'b'.repeat(64),
            signature: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
          },
          {
            component: 'renderer',
            name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
            sha256: 'c'.repeat(64),
            coreRange: '>=2.4.0',
          },
        ],
      }),
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(item => item.name === 'remote-manifest-integrity')

    assert.equal(integrityCheck?.status, 'fail')
    assert.deepEqual(integrityCheck?.issues, [
      'artifacts[0].signature sidecar must not be listed as a downloadable artifact',
    ])
  })

  it('fails gate-e when GitHub manifest release metadata drifts from Nexus release metadata', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        release: {
          version: '2.4.12-beta.7',
          channel: 'RELEASE',
          tag,
        },
      }),
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(item => item.name === 'remote-manifest-integrity')

    assert.equal(integrityCheck?.status, 'fail')
    assert.deepEqual(integrityCheck?.issues, [
      'release.tag must match release.version',
      'release.channel must match release.version suffix',
      'manifest release.version 2.4.12-beta.7 does not match remote 2.4.12-beta.8',
      'manifest release.channel RELEASE does not match remote BETA',
    ])
  })

  it('fails gate-e matrix check when the GitHub manifest has structural issues even if assets align', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        release: {
          version: '2.4.12-beta.8',
          channel: 'RELEASE',
          tag,
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(item => item.name === 'remote-manifest-nexus-matrix')

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(matrixCheck?.mismatches, [])
    assert.deepEqual(matrixCheck?.manifestIssues, [
      'release.channel must match release.version suffix',
      'manifest release.channel RELEASE does not match remote BETA',
    ])
  })

  it('fails gate-e when the GitHub manifest envelope is structurally invalid', async () => {
    installReleaseFetchMock({
      manifest: {
        schemaVersion: 2,
        release: {
          version: '2.4.12-beta.8',
          channel: 'RELEASE',
          tag: 'v2.4.12-beta.7',
        },
        artifacts: [
          {
            component: 'renderer',
            name: 'tuff-renderer-2.4.12-beta.8.zip',
            sha256: 'c'.repeat(64),
            coreRange: '>=2.4.0',
          },
        ],
      },
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(item => item.name === 'remote-manifest-integrity')
    const matrixCheck = checks.find(item => item.name === 'remote-manifest-nexus-matrix')

    assert.equal(integrityCheck?.status, 'fail')
    assert.deepEqual(integrityCheck?.issues, [
      'schemaVersion must be 1',
      'release.tag must match release.version',
      'release.channel must match release.version suffix',
      'artifacts must include at least one core artifact',
      'manifest release.tag v2.4.12-beta.7 does not match v2.4.12-beta.8',
      'manifest release.channel RELEASE does not match remote BETA',
    ])
    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason).sort(),
      ['missing-manifest-artifact', 'missing-manifest-artifact']
    )
  })
})
