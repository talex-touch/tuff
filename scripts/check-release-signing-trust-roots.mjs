import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DEFAULT_RELEASE_SIGNATURE_PUBLIC_KEY } from '../apps/nexus/server/utils/releaseSigningPublicKey.mjs'

export const RELEASE_SIGNING_TRUST_ROOT_PATHS = Object.freeze([
  'apps/core-app/resources/keys/release-signing-public.pem',
  'apps/nexus/resources/keys/release-signing-public.pem',
  'apps/nexus/server/keys/release-signing-public.pem',
])

export function publicKeyFingerprint(publicKey) {
  const der = crypto.createPublicKey(publicKey).export({
    type: 'spki',
    format: 'der',
  })
  return crypto.createHash('sha256').update(der).digest('hex')
}

export async function checkReleaseSigningTrustRoots({
  cwd = process.cwd(),
  paths = RELEASE_SIGNING_TRUST_ROOT_PATHS,
  embeddedPublicKey = DEFAULT_RELEASE_SIGNATURE_PUBLIC_KEY,
} = {}) {
  const sources = await Promise.all(
    paths.map(async relativePath => ({
      source: relativePath,
      fingerprint: publicKeyFingerprint(
        await readFile(resolve(cwd, relativePath), 'utf8'),
      ),
    })),
  )
  sources.push({
    source: 'apps/nexus/server/utils/releaseSigningPublicKey.mjs',
    fingerprint: publicKeyFingerprint(embeddedPublicKey),
  })

  const fingerprints = new Set(sources.map(({ fingerprint }) => fingerprint))
  if (fingerprints.size !== 1) {
    const details = sources
      .map(({ source, fingerprint }) => `${source}=${fingerprint}`)
      .join(', ')
    throw new Error(`Release signing trust-root mismatch: ${details}`)
  }

  return {
    fingerprint: sources[0].fingerprint,
    sources: sources.map(({ source }) => source),
  }
}

async function main() {
  console.log(JSON.stringify(await checkReleaseSigningTrustRoots(), null, 2))
}

const entryPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (
  entryPath
  && basename(process.argv[1]) === 'check-release-signing-trust-roots.mjs'
  && import.meta.url === entryPath
) {
  main().catch((error) => {
    console.error(
      `[check-release-signing-trust-roots] ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(1)
  })
}
