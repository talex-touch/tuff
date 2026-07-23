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
    schemaVersion: 2,
    release: {
      version: '2.4.12-beta.8',
      channel: 'BETA',
      tag,
      rollbackFromVersion: '2.4.12-beta.7',
      rollbackCompatible: false,
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
      {
        component: 'core',
        name: 'tuff-core-2.4.12-beta.8-linux-x64.AppImage',
        platform: 'linux',
        arch: 'x64',
        sha256: 'c'.repeat(64),
        signature: 'tuff-core-2.4.12-beta.8-linux-x64.AppImage.sig',
      },
    ],
    ...overrides,
  }
}

function buildRemoteRelease({ assets, release = {} }) {
  return {
    release: {
      tag,
      version: '2.4.12-beta.8',
      channel: 'BETA',
      status: 'published',
      rollbackFromVersion: '2.4.12-beta.7',
      rollbackCompatible: false,
      notes: {
        zh: '发版说明',
        en: 'Release notes',
      },
      notesHtml: {
        zh: '<p>发版说明</p>',
        en: '<p>Release notes</p>',
      },
      assets,
      ...release,
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
    {
      platform: 'linux',
      arch: 'x64',
      filename: 'tuff-core-2.4.12-beta.8-linux-x64.AppImage',
      downloadUrl: `${baseUrl}/api/releases/${tag}/download/linux/x64?exp=1700000000&sig=${signedDownloadSig}`,
      sha256: 'c'.repeat(64),
      signatureUrl: `${baseUrl}/api/releases/${tag}/signature/linux/x64`,
      ...overrides.linux,
    },
  ]
}

function buildGithubAssets(overrides = []) {
  return [
    {
      name: 'tuff-release-manifest.json',
      browser_download_url: `https://github.example.test/${tag}/tuff-release-manifest.json`,
      state: 'uploaded',
    },
    {
      name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
      browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-win32-x64-setup.exe`,
      digest: `sha256:${'a'.repeat(64)}`,
      state: 'uploaded',
    },
    {
      name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
      browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig`,
      state: 'uploaded',
    },
    {
      name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
      browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-darwin-arm64.dmg`,
      digest: `sha256:${'b'.repeat(64)}`,
      state: 'uploaded',
    },
    {
      name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
      browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig`,
      state: 'uploaded',
    },
    {
      name: 'tuff-core-2.4.12-beta.8-linux-x64.AppImage',
      browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-linux-x64.AppImage`,
      digest: `sha256:${'c'.repeat(64)}`,
      state: 'uploaded',
    },
    {
      name: 'tuff-core-2.4.12-beta.8-linux-x64.AppImage.sig',
      browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-linux-x64.AppImage.sig`,
      state: 'uploaded',
    },
    ...overrides,
  ]
}

function installReleaseFetchMock({
  assets = buildAssets(),
  manifest = buildManifest(),
  signatureResponses = {},
  downloadResponses = {},
  latestResponse,
  remoteResponse,
  remoteRelease = {},
  githubRelease = {},
  githubAssets = buildGithubAssets(),
} = {}) {
  const githubReleaseUrl = `https://api.github.com/repos/talex-touch/tuff/releases/tags/${tag}`
  const manifestUrl = `https://github.example.test/${tag}/tuff-release-manifest.json`
  const releaseUrl = `${baseUrl}/api/releases/${tag}?assets=true`
  const latestUrl = `${baseUrl}/api/releases/latest?channel=BETA`
  const rollbackHistoryUrl = `${baseUrl}/api/releases?channel=BETA&status=published&limit=100`
  const githubHistoryUrl
    = 'https://api.github.com/repos/talex-touch/tuff/releases?per_page=100'

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const textUrl = String(url)
      if (textUrl === releaseUrl) {
        if (remoteResponse === 'throw')
          throw new Error('remote release temporarily unavailable')
        if (remoteResponse) {
          return createJsonResponse(
            remoteResponse.body,
            remoteResponse.status ?? 200,
          )
        }
        return createJsonResponse(
          buildRemoteRelease({ assets, release: remoteRelease }),
        )
      }
      if (textUrl === githubReleaseUrl) {
        return createJsonResponse({
          tag_name: tag,
          draft: false,
          prerelease: true,
          assets: githubAssets,
          ...githubRelease,
        })
      }
      if (textUrl === manifestUrl)
        return createJsonResponse(manifest)
      if (
        textUrl.startsWith(`${baseUrl}/api/releases/${tag}/signature/`)
        || signatureResponses[textUrl]
      ) {
        const path = new URL(textUrl).pathname
        const pair = path.split('/').slice(-2).join('/')
        const override
          = signatureResponses[textUrl]
            ?? signatureResponses[pair]
            ?? signatureResponses.default
        if (override instanceof Response)
          return override
        if (override) {
          return new Response(
            override.body
            ?? '-----BEGIN PGP SIGNATURE-----\nvalid\n-----END PGP SIGNATURE-----',
            {
              status: override.status ?? 200,
              headers: override.headers ?? {
                'Content-Type': 'application/octet-stream',
              },
            },
          )
        }
        return new Response(
          '-----BEGIN PGP SIGNATURE-----\nvalid\n-----END PGP SIGNATURE-----',
          {
            status: 200,
            headers: {
              'Content-Type': 'application/pgp-signature',
            },
          },
        )
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
              Location:
                'https://github.example.test/releases/download/artifact',
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
      if (textUrl === latestUrl) {
        if (latestResponse instanceof Response)
          return latestResponse
        if (latestResponse === 'throw')
          throw new Error('latest query failed')
        if (latestResponse) {
          return createJsonResponse(
            latestResponse.body,
            latestResponse.status ?? 200,
          )
        }
        return createJsonResponse({
          release: {
            tag,
            version: '2.4.12-beta.8',
            channel: 'BETA',
            status: 'published',
          },
        })
      }
      if (textUrl === rollbackHistoryUrl) {
        return createJsonResponse({
          releases: [
            { version: '2.4.12-beta.8' },
            { version: '2.4.12-beta.7' },
          ],
        })
      }
      if (textUrl === githubHistoryUrl) {
        return createJsonResponse([
          { tag_name: tag },
          { tag_name: 'v2.4.12-beta.7' },
        ])
      }
      return createJsonResponse({ error: 'not found', url: textUrl }, 404)
    }),
  )
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

    assert.equal(
      checks.find(item => item.name === 'remote-github-release-metadata')
        ?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-release-metadata')?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-manifest-asset')?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-manifest-integrity')?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-manifest-nexus-matrix')
        ?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-github-asset-inventory')
        ?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-asset-integrity')?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-notes')?.status,
      'pass',
    )
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )
    assert.equal(downloadCheck?.status, 'pass')
    assert.equal(
      downloadCheck?.results.every(
        item =>
          item.hasExp
          && item.hasValidExp
          && item.hasValidSig
          && item.hasUnexpectedQuery === false,
      ),
      true,
    )
    const downloadSummary = JSON.stringify(downloadCheck?.results)
    assert.equal(downloadSummary.includes('requestUrl'), false)
    assert.equal(downloadSummary.includes('1700000000'), false)
    assert.equal(downloadSummary.includes(signedDownloadSig), false)
    assert.equal(downloadSummary.includes('?exp='), false)
  })

  it('fails gate-e when the GitHub release manifest asset is not uploaded', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-release-manifest.json'
          ? { ...asset, state: 'starter' }
          : asset,
      ),
    })

    const checks = await runCheck()
    const manifestCheck = checks.find(
      item => item.name === 'remote-manifest-asset',
    )

    assert.equal(manifestCheck?.status, 'fail')
    assert.equal(manifestCheck?.githubManifestStatus, 200)
    assert.equal(
      manifestCheck?.error,
      'manifest asset is not uploaded (starter)',
    )
  })

  it('keeps a non-uploaded GitHub release manifest asset as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-release-manifest.json'
          ? { ...asset, state: 'starter' }
          : asset,
      ),
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const manifestCheck = checks.find(
      item => item.name === 'remote-manifest-asset',
    )

    assert.equal(manifestCheck?.status, 'warn')
    assert.equal(manifestCheck?.githubManifestStatus, 200)
    assert.equal(
      manifestCheck?.error,
      'manifest asset is not uploaded (starter)',
    )
  })

  it('fails gate-e when the GitHub release manifest asset download URL points at another tag', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-release-manifest.json'
          ? {
              ...asset,
              browser_download_url:
                'https://github.example.test/v2.4.12-beta.7/tuff-release-manifest.json',
            }
          : asset,
      ),
    })

    const checks = await runCheck()
    const manifestCheck = checks.find(
      item => item.name === 'remote-manifest-asset',
    )

    assert.equal(manifestCheck?.status, 'fail')
    assert.equal(manifestCheck?.error, 'github-asset-download-url-mismatch')
    assert.deepEqual(manifestCheck?.manifestDownloadUrlInfo, {
      url: 'https://github.example.test/v2.4.12-beta.7/tuff-release-manifest.json',
      path: '/v2.4.12-beta.7/tuff-release-manifest.json',
      hasExpectedTag: false,
      hasExpectedName: true,
      valid: false,
      reason: 'github-asset-download-url-mismatch',
    })
  })

  it('keeps GitHub release manifest asset download URL filename drift as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-release-manifest.json'
          ? {
              ...asset,
              browser_download_url: `https://github.example.test/${tag}/release-manifest-old.json`,
            }
          : asset,
      ),
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const manifestCheck = checks.find(
      item => item.name === 'remote-manifest-asset',
    )

    assert.equal(manifestCheck?.status, 'warn')
    assert.equal(manifestCheck?.error, 'github-asset-download-url-mismatch')
    assert.deepEqual(manifestCheck?.manifestDownloadUrlInfo, {
      url: `https://github.example.test/${tag}/release-manifest-old.json`,
      path: `/${tag}/release-manifest-old.json`,
      hasExpectedTag: true,
      hasExpectedName: false,
      valid: false,
      reason: 'github-asset-download-url-mismatch',
    })
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
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason).sort(),
      ['filename-mismatch', 'sha256-mismatch'],
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-asset-integrity',
    )

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
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason),
      ['duplicate-nexus-asset'],
    )
    assert.equal(matrixCheck?.mismatches[0]?.key, 'win32/x64')
  })

  it('fails gate-e when Nexus exposes assets without platform arch or filename identity', async () => {
    installReleaseFetchMock({
      assets: [
        ...buildAssets(),
        {
          arch: 'x64',
          downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=1700000000&sig=${signedDownloadSig}`,
          sha256: 'c'.repeat(64),
          signatureUrl: `${baseUrl}/api/releases/${tag}/signature/win32/x64`,
        },
      ],
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.find(
        item => item.reason === 'invalid-nexus-asset-identity',
      ),
      {
        key: null,
        index: 3,
        platform: null,
        arch: 'x64',
        filename: null,
        reason: 'invalid-nexus-asset-identity',
      },
    )
  })

  it('fails gate-e when Nexus asset signatureUrl does not point at the release signature endpoint', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          signatureUrl:
            'https://cdn.example.test/tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(matrixCheck?.mismatches, [
      {
        key: 'win32/x64',
        reason: 'signature-url-mismatch',
        actual:
          'https://cdn.example.test/tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        expectedCanonical: `/api/releases/${tag}/signature/win32/x64`,
        expectedGithub: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig`,
      },
    ])
  })

  it('accepts an exact GitHub manifest sidecar URL and probes that configured URL', async () => {
    const signatureUrl = `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig`
    installReleaseFetchMock({
      assets: buildAssets({
        win32: { signatureUrl },
      }),
      signatureResponses: {
        [signatureUrl]: {
          body: '-----BEGIN PGP SIGNATURE-----\nvalid\n-----END PGP SIGNATURE-----',
          headers: { 'Content-Type': 'application/pgp-signature' },
        },
      },
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )
    const signatureCheck = checks.find(
      item => item.name === 'remote-signature-endpoint',
    )

    assert.equal(matrixCheck?.status, 'pass')
    assert.equal(
      matrixCheck?.nexusMatrix.find(item => item.platform === 'win32')
        ?.signatureUrlSource,
      'github',
    )
    assert.equal(signatureCheck?.status, 'pass')
    assert.equal(
      signatureCheck?.results.find(item => item.platform === 'win32')?.source,
      'external',
    )
    assert.equal(
      globalThis.fetch.mock.calls.some(([url]) => String(url) === signatureUrl),
      true,
    )
  })

  it('fails gate-e when Nexus asset signatureUrl includes signed download query parameters', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          signatureUrl: `${baseUrl}/api/releases/${tag}/signature/win32/x64?exp=1700000000&sig=${signedDownloadSig}`,
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason),
      ['signature-url-not-canonical'],
    )
    assert.deepEqual(matrixCheck?.mismatches[0], {
      key: 'win32/x64',
      reason: 'signature-url-not-canonical',
      actual: `${baseUrl}/api/releases/${tag}/signature/win32/x64?exp=1700000000&sig=${signedDownloadSig}`,
      expected: `/api/releases/${tag}/signature/win32/x64`,
      hasQuery: true,
      hasHash: false,
    })
  })

  it('fails gate-e when a canonical signature URL includes a fragment', async () => {
    const signatureUrl = `${baseUrl}/api/releases/${tag}/signature/win32/x64#sidecar`
    installReleaseFetchMock({
      assets: buildAssets({
        win32: { signatureUrl },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(matrixCheck?.mismatches, [
      {
        key: 'win32/x64',
        reason: 'signature-url-not-canonical',
        actual: signatureUrl,
        expected: `/api/releases/${tag}/signature/win32/x64`,
        hasQuery: false,
        hasHash: true,
      },
    ])
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
    const signatureCheck = checks.find(
      item => item.name === 'remote-signature-endpoint',
    )

    assert.equal(signatureCheck?.status, 'fail')
    assert.deepEqual(
      signatureCheck?.results.find(
        item => item.platform === 'win32' && item.arch === 'x64',
      ),
      {
        platform: 'win32',
        arch: 'x64',
        status: 200,
        validPayload: false,
        source: 'nexus',
        valid: false,
        reason: 'empty-signature-body',
        byteLength: 0,
        contentType: 'application/octet-stream',
        kind: 'empty',
      },
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
    const signatureCheck = checks.find(
      item => item.name === 'remote-signature-endpoint',
    )

    assert.equal(signatureCheck?.status, 'fail')
    assert.equal(
      signatureCheck?.results.find(
        item => item.platform === 'darwin' && item.arch === 'arm64',
      )?.reason,
      'json-signature-body',
    )
  })

  it('fails gate-e when a signature endpoint returns an HTML payload', async () => {
    installReleaseFetchMock({
      signatureResponses: {
        'linux/x64': {
          body: '<html><body>signature missing</body></html>',
          headers: { 'Content-Type': 'text/html' },
        },
      },
    })

    const checks = await runCheck()
    const signatureCheck = checks.find(
      item => item.name === 'remote-signature-endpoint',
    )

    assert.equal(signatureCheck?.status, 'fail')
    assert.equal(
      signatureCheck?.results.find(item => item.platform === 'linux')?.reason,
      'html-signature-body',
    )
  })

  it('fails gate-e when a signature endpoint does not return HTTP 200', async () => {
    installReleaseFetchMock({
      signatureResponses: {
        'win32/x64': { status: 404, body: 'signature missing' },
      },
    })

    const checks = await runCheck()
    const signatureCheck = checks.find(
      item => item.name === 'remote-signature-endpoint',
    )
    const result = signatureCheck?.results.find(
      item => item.platform === 'win32',
    )

    assert.equal(signatureCheck?.status, 'fail')
    assert.equal(result?.status, 404)
    assert.equal(result?.validPayload, false)
  })

  it('fails gate-e when Nexus asset downloadUrl does not point at the signed release download endpoint', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl:
            'https://github.example.test/releases/tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason),
      ['download-url-mismatch'],
    )
    assert.equal(
      matrixCheck?.mismatches[0]?.expected,
      `/api/releases/${tag}/download/win32/x64`,
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
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.deepEqual(
      downloadCheck?.results.find(
        item => item.platform === 'win32' && item.arch === 'x64',
      ),
      {
        platform: 'win32',
        arch: 'x64',
        status: 302,
        url: `${baseUrl}/api/releases/${tag}/download/win32/x64`,
        sameOrigin: true,
        path: `/api/releases/${tag}/download/win32/x64`,
        hasHash: false,
        hasExp: false,
        hasValidExp: false,
        hasSig: false,
        hasValidSig: false,
        hasDuplicateSignedQuery: false,
        duplicateQueryKeys: [],
        hasUnexpectedQuery: false,
        unexpectedQueryKeys: [],
        validResponse: true,
        responseKind: 'redirect',
        location: 'https://github.example.test/releases/download/artifact',
      },
    )
  })

  it('fails gate-e when a Nexus asset downloadUrl includes a fragment', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=1700000000&sig=${signedDownloadSig}#download`,
        },
      }),
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )
    const result = downloadCheck?.results.find(
      item => item.platform === 'win32' && item.arch === 'x64',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(result?.hasHash, true)
    assert.equal(result?.reason, 'download-url-has-fragment')
  })

  it('fails gate-e when a Nexus asset downloadUrl includes unexpected query parameters', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=1700000000&sig=${signedDownloadSig}&utm_source=release`,
        },
      }),
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )
    const result = downloadCheck?.results.find(
      item => item.platform === 'win32' && item.arch === 'x64',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(result?.hasUnexpectedQuery, true)
    assert.deepEqual(result?.unexpectedQueryKeys, ['utm_source'])
    assert.equal(result?.reason, 'download-url-has-unexpected-query')
  })

  it('fails gate-e when a Nexus asset downloadUrl repeats signed query parameters', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=1700000000&sig=${signedDownloadSig}&sig=${'e'.repeat(64)}`,
        },
      }),
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )
    const result = downloadCheck?.results.find(
      item => item.platform === 'win32' && item.arch === 'x64',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(result?.hasDuplicateSignedQuery, true)
    assert.deepEqual(result?.duplicateQueryKeys, ['sig'])
    assert.equal(result?.reason, 'download-url-has-duplicate-signed-query')
  })

  it('fails gate-e when a Nexus asset downloadUrl uses a malformed exp query', async () => {
    installReleaseFetchMock({
      assets: buildAssets({
        win32: {
          downloadUrl: `${baseUrl}/api/releases/${tag}/download/win32/x64?exp=soon&sig=${signedDownloadSig}`,
        },
      }),
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(
      downloadCheck?.results.find(
        item => item.platform === 'win32' && item.arch === 'x64',
      )?.hasValidExp,
      false,
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
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(
      downloadCheck?.results.find(
        item => item.platform === 'darwin' && item.arch === 'arm64',
      )?.hasValidSig,
      false,
    )
  })

  it('fails gate-e when the signed download endpoint redirects without a Location header', async () => {
    installReleaseFetchMock({
      downloadResponses: {
        'win32/x64': new Response('', { status: 302 }),
      },
    })

    const checks = await runCheck()
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.deepEqual(
      downloadCheck?.results.find(
        item => item.platform === 'win32' && item.arch === 'x64',
      ),
      {
        platform: 'win32',
        arch: 'x64',
        status: 302,
        url: `${baseUrl}/api/releases/${tag}/download/win32/x64`,
        sameOrigin: true,
        path: `/api/releases/${tag}/download/win32/x64`,
        hasHash: false,
        hasExp: true,
        hasValidExp: true,
        hasSig: true,
        hasValidSig: true,
        hasDuplicateSignedQuery: false,
        duplicateQueryKeys: [],
        hasUnexpectedQuery: false,
        unexpectedQueryKeys: [],
        validResponse: false,
        responseKind: 'redirect',
        location: null,
        reason: 'missing-redirect-location',
      },
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
    const downloadCheck = checks.find(
      item => item.name === 'remote-download-endpoint',
    )

    assert.equal(downloadCheck?.status, 'fail')
    assert.equal(
      downloadCheck?.results.find(
        item => item.platform === 'darwin' && item.arch === 'arm64',
      )?.reason,
      'json-download-body',
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[0].signature must point to the artifact .sig/.asc sidecar',
      ),
    )
  })

  it('fails gate-e when a GitHub manifest core artifact name disagrees with platform or arch', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        artifacts: [
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
            platform: 'darwin',
            arch: 'arm64',
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
      }),
    })

    const checks = await runCheck()
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[0].platform does not match artifact name',
      ),
    )
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[0].arch does not match artifact name',
      ),
    )
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[1] duplicates platform/arch darwin/arm64',
      ),
    )
  })

  it('fails gate-e when a GitHub manifest core artifact name has no recognizable platform', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        artifacts: [
          {
            component: 'core',
            name: 'tuff-core-2.4.12-beta.8-portable.bin',
            platform: 'linux',
            arch: 'x64',
            sha256: 'a'.repeat(64),
            signature: 'tuff-core-2.4.12-beta.8-portable.bin.sig',
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[0].name must include a recognizable core platform',
      ),
    )
  })

  it('fails gate-e when a GitHub manifest core artifact name omits the release version', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        artifacts: [
          {
            component: 'core',
            name: 'tuff-core-win32-x64-setup.exe',
            platform: 'win32',
            arch: 'x64',
            sha256: 'a'.repeat(64),
            signature: 'tuff-core-win32-x64-setup.exe.sig',
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[0].name must include release.version',
      ),
    )
    assert.deepEqual(
      integrityCheck?.manifestIssueDetails.find(
        item => item.reason === 'name must include release.version',
      ),
      {
        scope: 'artifact',
        index: 0,
        field: 'name',
        component: 'core',
        name: 'tuff-core-win32-x64-setup.exe',
        platform: 'win32',
        arch: 'x64',
        reason: 'name must include release.version',
      },
    )
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes('artifacts[1].sha256 must be unique'),
    )
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts[0].signature sidecar must not be listed as a downloadable artifact',
      ),
    )
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'manifest release.version 2.4.12-beta.7 does not match remote 2.4.12-beta.8',
      ),
    )
    assert.ok(
      integrityCheck?.issues.includes(
        'manifest release.channel RELEASE does not match remote BETA',
      ),
    )
  })

  it('fails gate-e when GitHub release assets are missing manifest core artifacts', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().filter(
        asset => asset.name !== 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'darwin',
        arch: 'arm64',
        name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
        kind: 'artifact',
        reason: 'missing-github-asset',
      },
    ])
  })

  it('fails gate-e when GitHub release core assets have no download URL', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe'
          ? { ...asset, browser_download_url: undefined }
          : asset,
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'win32',
        arch: 'x64',
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        kind: 'artifact',
        reason: 'missing-browser-download-url',
      },
    ])
  })

  it('fails gate-e when GitHub release core asset download URLs point at another tag', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe'
          ? {
              ...asset,
              browser_download_url:
                'https://github.example.test/v2.4.12-beta.7/tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
            }
          : asset,
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'win32',
        arch: 'x64',
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        kind: 'artifact',
        url: 'https://github.example.test/v2.4.12-beta.7/tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        path: '/v2.4.12-beta.7/tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        expectedTag: tag,
        expectedName: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        hasExpectedTag: false,
        hasExpectedName: true,
        reason: 'github-asset-download-url-mismatch',
      },
    ])
  })

  it('fails gate-e when GitHub release core assets are not uploaded', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe'
          ? { ...asset, state: 'starter' }
          : asset,
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'win32',
        arch: 'x64',
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        kind: 'artifact',
        state: 'starter',
        reason: 'github-asset-not-uploaded',
      },
    ])
  })

  it('fails gate-e when GitHub release assets duplicate declared core artifact names', async () => {
    const githubAssets = buildGithubAssets()
    installReleaseFetchMock({
      githubAssets: [
        ...githubAssets,
        {
          ...githubAssets.find(
            asset =>
              asset.name === 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
          ),
          browser_download_url: `https://github.example.test/${tag}/duplicate-win32.exe`,
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.issues, [
      'github release asset name tuff-core-2.4.12-beta.8-win32-x64-setup.exe must be unique',
    ])
    assert.deepEqual(inventoryCheck?.duplicateAssets, [
      {
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        firstIndex: 1,
        duplicateIndex: 7,
        reason: 'duplicate-github-asset-name',
      },
    ])
    assert.deepEqual(inventoryCheck?.missing, [])
  })

  it('fails gate-e when GitHub release contains undeclared core assets', async () => {
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: 'tuff-core-2.4.12-beta.8-linux-arm64.AppImage',
          browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-linux-arm64.AppImage`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.issues, [
      'github release asset name tuff-core-2.4.12-beta.8-linux-arm64.AppImage is not declared by manifest',
    ])
    assert.deepEqual(inventoryCheck?.extraAssets, [
      {
        name: 'tuff-core-2.4.12-beta.8-linux-arm64.AppImage',
        index: 7,
        reason: 'extra-github-release-asset',
      },
    ])
    assert.deepEqual(inventoryCheck?.missing, [])
  })

  it('keeps undeclared core GitHub release assets as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: 'tuff-core-2.4.12-beta.8-linux-arm64.AppImage.sig',
          browser_download_url: `https://github.example.test/${tag}/tuff-core-2.4.12-beta.8-linux-arm64.AppImage.sig`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'warn')
    assert.deepEqual(inventoryCheck?.extraAssets, [
      {
        name: 'tuff-core-2.4.12-beta.8-linux-arm64.AppImage.sig',
        index: 7,
        reason: 'extra-github-release-asset',
      },
    ])
  })

  it('allows extra non-core GitHub release metadata assets', async () => {
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: 'release-evidence.json',
          browser_download_url: `https://github.example.test/${tag}/release-evidence.json`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'pass')
    assert.deepEqual(inventoryCheck?.issues, [])
    assert.deepEqual(inventoryCheck?.extraAssets, [])
  })

  it('allows an additional Linux DEB and its sidecar for a declared manifest pair', async () => {
    const packageName = 'tuff-core-2.4.12-beta.8-linux-x64.deb'
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: packageName,
          browser_download_url: `https://github.example.test/${tag}/${packageName}`,
          digest: `sha256:${'d'.repeat(64)}`,
          state: 'uploaded',
        },
        {
          name: `${packageName}.sig`,
          browser_download_url: `https://github.example.test/${tag}/${packageName}.sig`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'pass')
    assert.deepEqual(inventoryCheck?.additionalPackages, [
      {
        platform: 'linux',
        arch: 'x64',
        name: packageName,
        signature: `${packageName}.sig`,
      },
    ])
  })

  it('fails gate-e when an additional package for a declared pair lacks its sidecar', async () => {
    const packageName = 'tuff-core-2.4.12-beta.8-linux-x64.deb'
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: packageName,
          browser_download_url: `https://github.example.test/${tag}/${packageName}`,
          digest: `sha256:${'d'.repeat(64)}`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'linux',
        arch: 'x64',
        name: `${packageName}.sig`,
        artifact: packageName,
        kind: 'signature',
        reason: 'missing-github-asset',
      },
    ])
  })

  it('fails gate-e when a declared-pair sidecar has no package', async () => {
    const packageName = 'tuff-core-2.4.12-beta.8-linux-x64.deb'
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: `${packageName}.sig`,
          browser_download_url: `https://github.example.test/${tag}/${packageName}.sig`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.extraAssets, [
      {
        name: `${packageName}.sig`,
        index: 7,
        reason: 'extra-github-release-asset',
      },
    ])
  })

  it('fails gate-e when a complete package pair targets no manifest pair', async () => {
    const packageName = 'tuff-core-2.4.12-beta.8-linux-arm64.AppImage'
    installReleaseFetchMock({
      githubAssets: [
        ...buildGithubAssets(),
        {
          name: packageName,
          browser_download_url: `https://github.example.test/${tag}/${packageName}`,
          digest: `sha256:${'d'.repeat(64)}`,
          state: 'uploaded',
        },
        {
          name: `${packageName}.sig`,
          browser_download_url: `https://github.example.test/${tag}/${packageName}.sig`,
          state: 'uploaded',
        },
      ],
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(
      inventoryCheck?.extraAssets.map(item => item.name),
      [packageName, `${packageName}.sig`],
    )
  })

  it('fails gate-e when GitHub release assets are missing manifest signature sidecars', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().filter(
        asset =>
          asset.name !== 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'win32',
        arch: 'x64',
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe.sig',
        artifact: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        kind: 'signature',
        reason: 'missing-github-asset',
      },
    ])
  })

  it('fails gate-e when GitHub release signature sidecars have no download URL', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig'
          ? { name: asset.name }
          : asset,
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'fail')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'darwin',
        arch: 'arm64',
        name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
        artifact: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
        kind: 'signature',
        reason: 'missing-browser-download-url',
      },
    ])
  })

  it('keeps GitHub release signature download URL drift as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig'
          ? {
              ...asset,
              browser_download_url: `https://github.example.test/${tag}/wrong-sidecar.sig`,
            }
          : asset,
      ),
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'warn')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'darwin',
        arch: 'arm64',
        name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
        artifact: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
        kind: 'signature',
        url: `https://github.example.test/${tag}/wrong-sidecar.sig`,
        path: `/${tag}/wrong-sidecar.sig`,
        expectedTag: tag,
        expectedName: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
        hasExpectedTag: true,
        hasExpectedName: false,
        reason: 'github-asset-download-url-mismatch',
      },
    ])
  })

  it('keeps non-uploaded GitHub release signature sidecars as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig'
          ? { ...asset, state: 'starter' }
          : asset,
      ),
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'warn')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'darwin',
        arch: 'arm64',
        name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
        artifact: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
        kind: 'signature',
        state: 'starter',
        reason: 'github-asset-not-uploaded',
      },
    ])
  })

  it('allows GitHub release assets without an optional upload state', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().map(
        ({ state: _state, ...asset }) => asset,
      ),
    })

    const checks = await runCheck()
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'pass')
    assert.deepEqual(inventoryCheck?.missing, [])
  })

  it('keeps missing GitHub release assets as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().filter(
        asset => asset.name !== 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
      ),
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'warn')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'win32',
        arch: 'x64',
        name: 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe',
        kind: 'artifact',
        reason: 'missing-github-asset',
      },
    ])
  })

  it('keeps missing GitHub release signature sidecars as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubAssets: buildGithubAssets().filter(
        asset =>
          asset.name !== 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
      ),
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(inventoryCheck?.status, 'warn')
    assert.deepEqual(inventoryCheck?.missing, [
      {
        platform: 'darwin',
        arch: 'arm64',
        name: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg.sig',
        artifact: 'tuff-core-2.4.12-beta.8-darwin-arm64.dmg',
        kind: 'signature',
        reason: 'missing-github-asset',
      },
    ])
  })

  it('fails gate-e matrix check when the GitHub manifest has structural issues even if assets align', async () => {
    installReleaseFetchMock({
      manifest: buildManifest({
        release: {
          version: '2.4.12-beta.8',
          channel: 'RELEASE',
          tag,
          rollbackFromVersion: '2.4.12-beta.7',
          rollbackCompatible: false,
        },
      }),
    })

    const checks = await runCheck()
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(matrixCheck?.mismatches, [])
    assert.ok(
      matrixCheck?.manifestIssues.includes(
        'release.channel must match release.version suffix',
      ),
    )
    assert.ok(
      matrixCheck?.manifestIssues.includes(
        'manifest release.channel RELEASE does not match remote BETA',
      ),
    )
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
    const integrityCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )
    const matrixCheck = checks.find(
      item => item.name === 'remote-manifest-nexus-matrix',
    )

    assert.equal(integrityCheck?.status, 'fail')
    assert.ok(
      integrityCheck?.issues.includes(
        'release.rollbackFromVersion is required',
      ),
    )
    assert.ok(
      integrityCheck?.issues.includes(
        'release.rollbackCompatible must be boolean',
      ),
    )
    assert.ok(
      integrityCheck?.issues.includes(
        'artifacts must include at least one core artifact',
      ),
    )
    assert.equal(matrixCheck?.status, 'fail')
    assert.deepEqual(
      matrixCheck?.mismatches.map(item => item.reason).sort(),
      [
        'missing-manifest-artifact',
        'missing-manifest-artifact',
        'missing-manifest-artifact',
      ],
    )
  })

  it('fails gate-e when remote release metadata does not match the checked release', async () => {
    installReleaseFetchMock({
      remoteRelease: {
        tag: 'v2.4.12-beta.7',
        version: '2.4.12-beta.7',
        channel: 'RELEASE',
        status: 'draft',
      },
    })

    const checks = await runCheck()
    const metadataCheck = checks.find(
      item => item.name === 'remote-release-metadata',
    )

    assert.equal(metadataCheck?.status, 'fail')
    assert.deepEqual(metadataCheck?.issues, [
      'release.tag v2.4.12-beta.7 does not match v2.4.12-beta.8',
      'release.version 2.4.12-beta.7 does not match 2.4.12-beta.8',
      'release.channel must match release.version suffix',
      'release.status must be published',
    ])
  })

  it('keeps remote release metadata drift as a warning before gate-e', async () => {
    installReleaseFetchMock({
      remoteRelease: {
        status: 'draft',
      },
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const metadataCheck = checks.find(
      item => item.name === 'remote-release-metadata',
    )

    assert.equal(metadataCheck?.status, 'warn')
    assert.deepEqual(metadataCheck?.issues, [
      'release.status must be published',
    ])
  })

  it('fails gate-e when GitHub release metadata drifts from the checked release', async () => {
    installReleaseFetchMock({
      githubRelease: {
        tag_name: 'v2.4.12-beta.7',
        draft: true,
        prerelease: false,
      },
    })

    const checks = await runCheck()
    const metadataCheck = checks.find(
      item => item.name === 'remote-github-release-metadata',
    )

    assert.equal(metadataCheck?.status, 'fail')
    assert.deepEqual(metadataCheck?.issues, [
      'github.tag_name v2.4.12-beta.7 does not match v2.4.12-beta.8',
      'github.draft must be false',
      'github.prerelease must be true for BETA',
    ])
  })

  it('keeps GitHub release metadata drift as a warning before gate-e', async () => {
    installReleaseFetchMock({
      githubRelease: {
        draft: true,
      },
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const metadataCheck = checks.find(
      item => item.name === 'remote-github-release-metadata',
    )

    assert.equal(metadataCheck?.status, 'warn')
    assert.deepEqual(metadataCheck?.issues, ['github.draft must be false'])
  })

  it('fails gate-e when the channel latest pointer does not match the checked release tag', async () => {
    installReleaseFetchMock({
      latestResponse: {
        body: {
          release: {
            tag: 'v2.4.12-beta.7',
            version: '2.4.12-beta.8',
            channel: 'BETA',
            status: 'published',
          },
        },
      },
    })

    const checks = await runCheck()
    const latestCheck = checks.find(item => item.name === 'remote-latest')

    assert.equal(latestCheck?.status, 'fail')
    assert.equal(latestCheck?.latestTag, 'v2.4.12-beta.7')
    assert.equal(latestCheck?.expectedTag, tag)
    assert.deepEqual(latestCheck?.issues, [
      'latest release.tag v2.4.12-beta.7 does not match v2.4.12-beta.8',
    ])
  })

  it('keeps channel latest mismatch as a warning before gate-e', async () => {
    installReleaseFetchMock({
      latestResponse: {
        body: {
          release: {
            tag: 'v2.4.12-beta.7',
            version: '2.4.12-beta.8',
            channel: 'BETA',
            status: 'published',
          },
        },
      },
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const latestCheck = checks.find(item => item.name === 'remote-latest')

    assert.equal(latestCheck?.status, 'warn')
    assert.equal(latestCheck?.latestTag, 'v2.4.12-beta.7')
    assert.equal(latestCheck?.expectedTag, tag)
    assert.deepEqual(latestCheck?.issues, [
      'latest release.tag v2.4.12-beta.7 does not match v2.4.12-beta.8',
    ])
  })

  it('fails gate-e when the channel latest metadata drifts while the tag matches', async () => {
    installReleaseFetchMock({
      latestResponse: {
        body: {
          release: {
            tag,
            version: '2.4.12-beta.7',
            channel: 'RELEASE',
            status: 'draft',
          },
        },
      },
    })

    const checks = await runCheck()
    const latestCheck = checks.find(item => item.name === 'remote-latest')

    assert.equal(latestCheck?.status, 'fail')
    assert.equal(latestCheck?.latestTag, tag)
    assert.equal(latestCheck?.latestVersion, '2.4.12-beta.7')
    assert.equal(latestCheck?.latestChannel, 'RELEASE')
    assert.equal(latestCheck?.latestStatus, 'draft')
    assert.equal(latestCheck?.expectedVersion, '2.4.12-beta.8')
    assert.equal(latestCheck?.expectedChannel, 'BETA')
    assert.deepEqual(latestCheck?.issues, [
      'latest release.version 2.4.12-beta.7 does not match 2.4.12-beta.8',
      'latest release.channel RELEASE does not match BETA',
      'latest release.status must be published',
    ])
  })

  it('keeps channel latest metadata drift as a warning before gate-e', async () => {
    installReleaseFetchMock({
      latestResponse: {
        body: {
          release: {
            tag,
            version: '2.4.12-beta.8',
            channel: 'BETA',
            status: 'draft',
          },
        },
      },
    })

    const checks = await runCheck({ stage: 'gate-d' })
    const latestCheck = checks.find(item => item.name === 'remote-latest')

    assert.equal(latestCheck?.status, 'warn')
    assert.equal(latestCheck?.latestTag, tag)
    assert.equal(latestCheck?.latestVersion, '2.4.12-beta.8')
    assert.equal(latestCheck?.latestChannel, 'BETA')
    assert.equal(latestCheck?.latestStatus, 'draft')
    assert.deepEqual(latestCheck?.issues, [
      'latest release.status must be published',
    ])
  })

  it('fails gate-e when the channel latest endpoint omits required metadata', async () => {
    installReleaseFetchMock({
      latestResponse: {
        body: {
          release: {
            tag,
          },
        },
      },
    })

    const checks = await runCheck()
    const latestCheck = checks.find(item => item.name === 'remote-latest')

    assert.equal(latestCheck?.status, 'fail')
    assert.deepEqual(latestCheck?.issues, [
      'latest release.version <missing> does not match 2.4.12-beta.8',
      'latest release.channel <missing> does not match BETA',
      'latest release.status must be published',
    ])
  })

  it('fails gate-e when the channel latest endpoint cannot be queried', async () => {
    installReleaseFetchMock({
      latestResponse: 'throw',
    })

    const checks = await runCheck()
    const latestCheck = checks.find(item => item.name === 'remote-latest')

    assert.equal(latestCheck?.status, 'fail')
    assert.equal(latestCheck?.error, 'latest query failed')
  })
  it('passes schema 2 matrix only when the manifest rollback target is the exact same-channel N-1', async () => {
    installReleaseFetchMock()

    const checks = await runCheck()

    assert.equal(
      checks.find(item => item.name === 'remote-manifest-integrity')?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-manifest-nexus-matrix')
        ?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-manifest-rollback')?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-manifest-rollback')
        ?.expectedRollbackFromVersion,
      '2.4.12-beta.7',
    )
  })

  it.each([
    {
      name: 'missing',
      rollbackFromVersion: undefined,
      issue: 'release.rollbackFromVersion is required',
    },
    {
      name: 'wrong N-2',
      rollbackFromVersion: '2.4.12-beta.6',
      issue:
        'release.rollbackFromVersion must match the expected same-channel N-1 version',
    },
    {
      name: 'equal current version',
      rollbackFromVersion: '2.4.12-beta.8',
      issue: 'release.rollbackFromVersion must be older than release.version',
    },
    {
      name: 'future version',
      rollbackFromVersion: '2.4.12-beta.9',
      issue: 'release.rollbackFromVersion must be older than release.version',
    },
    {
      name: 'cross-channel version',
      rollbackFromVersion: '2.4.12',
      issue: 'release.rollbackFromVersion must use the same channel',
    },
  ])(
    'fails the rollback gate for $name metadata',
    async ({ rollbackFromVersion, issue }) => {
      installReleaseFetchMock({
        manifest: buildManifest({
          release: {
            ...buildManifest().release,
            rollbackFromVersion,
          },
        }),
      })

      const checks = await runCheck()
      const rollbackCheck = checks.find(
        item => item.name === 'remote-manifest-rollback',
      )

      assert.equal(rollbackCheck?.status, 'fail')
      assert.ok(rollbackCheck?.issues.includes(issue))
    },
  )

  it('fails when Nexus rollback metadata or GitHub asset digest drifts from the manifest', async () => {
    installReleaseFetchMock({
      remoteRelease: { rollbackCompatible: true },
      githubAssets: buildGithubAssets().map(asset =>
        asset.name === 'tuff-core-2.4.12-beta.8-win32-x64-setup.exe'
          ? { ...asset, digest: `sha256:${'f'.repeat(64)}` }
          : asset,
      ),
    })

    const checks = await runCheck()
    const manifestCheck = checks.find(
      item => item.name === 'remote-manifest-integrity',
    )
    const inventoryCheck = checks.find(
      item => item.name === 'remote-github-asset-inventory',
    )

    assert.equal(manifestCheck?.status, 'fail')
    assert.ok(
      manifestCheck?.issues.includes(
        'manifest release.rollbackCompatible does not match remote release',
      ),
    )
    assert.equal(inventoryCheck?.status, 'fail')
    assert.ok(
      inventoryCheck?.missing.some(
        item => item.reason === 'github-sha256-digest-mismatch',
      ),
    )
  })

  it('keeps the release blocked when a transient Nexus failure permits a valid GitHub fallback', async () => {
    installReleaseFetchMock({
      remoteResponse: { status: 503, body: { error: 'temporary outage' } },
    })

    const checks = await runCheck()

    assert.equal(
      checks.find(item => item.name === 'remote-release')?.status,
      'blocked',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-github-fallback-contract')
        ?.status,
      'pass',
    )
    assert.equal(
      checks.find(item => item.name === 'remote-github-fallback-rollback')
        ?.status,
      'pass',
    )
  })
})
