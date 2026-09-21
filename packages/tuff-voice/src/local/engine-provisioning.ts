/**
 * Provisioning the engine executables a bundle needs.
 *
 * A speech bundle is useless without the binary that runs it: `whisper-cpp` models need
 * `whisper-cli`, `sherpa-onnx` models need `sherpa-onnx-offline`. Until now Tuff looked for
 * those on `PATH` and in the Homebrew prefixes, which works only for a user who already
 * installed them — and sherpa-onnx has no Homebrew formula at all, so an on-device sherpa
 * model could be downloaded, verified, installed, and still refuse to run.
 *
 * So the runtime is treated exactly like the model: fetched from the catalog, digest-verified,
 * and unpacked into a directory Tuff owns. Three guarantees, the same three as the model store:
 *
 * 1. an archive is verified *before* it is unpacked, and the executable is required to exist
 *    afterwards at the path the catalog names;
 * 2. a runtime is only visible once its manifest is written, so an interrupted extraction
 *    leaves nothing that resolution will pick up;
 * 3. an already-installed runtime is not fetched again.
 *
 * Extraction uses the system `tar`, which handles the `tar.bz2`/`tar.gz` archives the upstream
 * releases publish and also reads zip. Node has no bzip2 decoder, and pulling one in would buy
 * nothing: `tar` is present on every host this ships to (bsdtar on macOS and Windows, GNU tar
 * on Linux).
 */

import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { access, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { accessSync, constants, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import type { SpeechRuntimeEntryV1 } from './model-catalog'

const run = promisify(execFile)

export const ENGINE_MANIFEST_FILE = 'runtime.json'

/** Where provisioned runtimes live. Same override rules as the model store. */
export function resolveEngineRoot(explicit?: string): string {
  if (explicit) return resolve(explicit)
  const fromEnv = process.env.TUFF_SPEECH_ENGINE_DIR?.trim()
  if (fromEnv) return resolve(fromEnv)
  if (process.platform === 'darwin')
    return join(homedir(), 'Library', 'Application Support', 'Tuff', 'speech-engine')
  const dataHome = process.env.XDG_DATA_HOME?.trim() || join(homedir(), '.local', 'share')
  return join(dataHome, 'Tuff', 'speech-engine')
}

/** Host identity a runtime entry is matched against. */
export function currentPlatformTag(): string {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
  if (process.platform === 'darwin') return `darwin-${arch}`
  if (process.platform === 'win32') return `win32-${arch}`
  return `linux-${arch}`
}

export class SpeechRuntimeInstallError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'SpeechRuntimeInstallError'
    this.code = code
  }
}

function versionDirectory(root: string, runtimeId: string, version: string): string {
  return join(root, runtimeId, version)
}

/** Absolute path of the executable inside an installed runtime, if it is there. */
export function runtimeBinaryPath(
  root: string,
  runtimeId: string,
  version: string,
  binary: string,
): string {
  return resolveInside(versionDirectory(root, runtimeId, version), binary)
}

function resolveInside(directory: string, relative: string): string {
  if (isAbsolute(relative))
    throw new SpeechRuntimeInstallError('SPEECH_RUNTIME_INVALID', `binary path "${relative}" must be relative`)
  const target = resolve(directory, relative)
  if (!target.startsWith(directory + sep))
    throw new SpeechRuntimeInstallError('SPEECH_RUNTIME_INVALID', `path "${relative}" escapes its runtime directory`)
  return target
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function isExecutableSync(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Newest installed runtime for an engine, when one is present and complete.
 *
 * Newest-first rather than first-found: a newer runtime that failed to install must not
 * shadow an older one that works, so a version is only a candidate once its manifest is
 * readable and its executable is there.
 *
 * Synchronous on purpose. The engine's own binary lookup runs inside a synchronous host path,
 * and it has to see the same answer: a runtime that this function can find but
 * `findSherpaBinary` cannot leaves a downloaded, digest-verified engine unused while the
 * model reports a missing binary the user has no way to install.
 */
export function resolveInstalledRuntimeSync(
  runtimeId: string,
  binary: string,
  root = resolveEngineRoot(),
): string | null {
  let versions: string[]
  try {
    versions = readdirSync(join(root, runtimeId))
  } catch {
    return null
  }
  const ordered = versions
    .filter(version => /^\d+\.\d+\.\d+$/.test(version))
    .sort((a, b) => {
      const left = a.split('.').map(Number)
      const right = b.split('.').map(Number)
      for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index])
          return right[index]! - left[index]!
      }
      return 0
    })

  for (const version of ordered) {
    const directory = versionDirectory(root, runtimeId, version)
    try {
      const manifest = JSON.parse(readFileSync(join(directory, ENGINE_MANIFEST_FILE), 'utf8')) as {
        binary?: string
      }
      const candidate = resolveInside(directory, manifest.binary ?? binary)
      if (isExecutableSync(candidate))
        return candidate
    }
    catch {
      continue
    }
  }
  return null
}

/** Promise-shaped wrapper, for callers that already live in an async context. */
export async function resolveInstalledRuntime(
  runtimeId: string,
  binary: string,
  root = resolveEngineRoot(),
): Promise<string | null> {
  return resolveInstalledRuntimeSync(runtimeId, binary, root)
}

export interface InstallSpeechRuntimeOptions {
  root?: string
  fetchImpl?: typeof fetch
  onProgress?: (progress: { received: number; total: number }) => void
  signal?: AbortSignal
}

/** Download, verify and unpack one runtime. Returns the executable's path. */
export async function installSpeechRuntime(
  entry: SpeechRuntimeEntryV1,
  options: InstallSpeechRuntimeOptions = {},
): Promise<{ binaryPath: string; directory: string; downloaded: boolean }> {
  const root = options.root ?? resolveEngineRoot()
  const directory = versionDirectory(root, entry.id, entry.version)
  const manifestPath = join(directory, ENGINE_MANIFEST_FILE)

  // Already installed: the manifest is the completion marker, so this cannot see a
  // half-extracted runtime. It is also the authority on *where* the executable landed, because
  // an archive that unpacks to a top-level directory puts it one level below the path the
  // catalog names.
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      sha256?: string
      binary?: string
    }
    const recorded = resolveInside(directory, manifest.binary ?? entry.binary)
    if (manifest.sha256 === entry.sha256 && (await isExecutable(recorded)))
      return { binaryPath: recorded, directory, downloaded: false }
  } catch {
    // Not installed, or not readable: fall through and install it.
  }

  await mkdir(directory, { recursive: true })
  await rm(manifestPath, { force: true })

  const archive = join(directory, `.runtime.${entry.archive}`)
  await rm(archive, { force: true })

  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(entry.url, { redirect: 'follow', ...(options.signal ? { signal: options.signal } : {}) })
  if (!response.ok)
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_DOWNLOAD_FAILED',
      `${entry.id}@${entry.version}: HTTP ${response.status} ${response.statusText} from ${entry.url}`,
    )
  if (!response.body)
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_DOWNLOAD_FAILED',
      `${entry.id}@${entry.version}: the response carried no body`,
    )

  const hash = createHash('sha256')
  let received = 0
  const sink = createWriteStream(archive)
  const writeFailure = new Promise<never>((_finished, failed) => sink.once('error', failed))
  try {
    for await (const chunk of Readable.fromWeb(response.body as never)) {
      const buffer = chunk as Buffer
      received += buffer.byteLength
      hash.update(buffer)
      if (!sink.write(buffer))
        await Promise.race([new Promise<void>((done) => sink.once('drain', () => done())), writeFailure])
      options.onProgress?.({ received, total: entry.bytes })
    }
    await new Promise<void>((finished, failed) => {
      sink.once('error', failed)
      sink.once('finish', () => finished())
      sink.end()
    })
  } catch (error) {
    sink.destroy()
    await rm(archive, { force: true })
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_WRITE_FAILED',
      `${entry.id}@${entry.version}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const digest = hash.digest('hex')
  if (digest !== entry.sha256 || (received && entry.bytes && received !== entry.bytes)) {
    await rm(archive, { force: true })
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_DIGEST_MISMATCH',
      `${entry.id}@${entry.version}: refusing to install — expected ${entry.bytes} bytes / ${entry.sha256}, got ${received} bytes / ${digest}`,
    )
  }

  // Extract into a staging directory, then move the pieces in: an archive that unpacks to
  // something unexpected leaves the install directory untouched.
  const staging = join(directory, '.extract')
  await rm(staging, { recursive: true, force: true })
  await mkdir(staging, { recursive: true })
  const tarFlag = entry.archive === 'zip' ? '-xf' : entry.archive === 'tar.gz' ? '-xzf' : '-xjf'
  try {
    await run('tar', [tarFlag, archive, '-C', staging])
  } catch (error) {
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_EXTRACT_FAILED',
      `${entry.id}@${entry.version}: tar failed — ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const extracted = await readdir(staging)
  const payload = extracted.length === 1 ? join(staging, extracted[0] as string) : staging
  const stagedBinary = resolveInside(payload, entry.binary)
  try {
    await stat(stagedBinary)
  } catch {
    await rm(staging, { recursive: true, force: true })
    await rm(archive, { force: true })
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_INVALID',
      `${entry.id}@${entry.version}: the archive has no ${entry.binary} where the catalog says it is`,
    )
  }

  for (const name of extracted) {
    const from = join(staging, name)
    const to = join(directory, name)
    await rm(to, { recursive: true, force: true })
    await rename(from, to)
  }
  await rm(staging, { recursive: true, force: true })
  await rm(archive, { force: true })

  // A release tarball usually unpacks to a single top-level directory named after the release,
  // so the executable ends up one level deeper than the catalog's `bin/sherpa-onnx-offline`.
  // The manifest has to record where the file actually landed — relative to the version
  // directory — because that manifest is what decides "already installed" on the next start:
  // recording the catalog's own relative path made every start re-download the runtime and
  // never resolve the binary it had just unpacked.
  const nested = extracted.length === 1 ? (extracted[0] as string) : ''
  const relativeBinary = nested ? `${nested}/${entry.binary}` : entry.binary
  const installedBinary = resolveInside(directory, relativeBinary)
  if (!(await isExecutable(installedBinary)))
    throw new SpeechRuntimeInstallError(
      'SPEECH_RUNTIME_INVALID',
      `${entry.id}@${entry.version}: ${entry.binary} was extracted but is not executable`,
    )

  await writeFile(
    manifestPath,
    `${JSON.stringify({ id: entry.id, version: entry.version, platform: entry.platform, sha256: entry.sha256, binary: relativeBinary }, null, 2)}\n`,
    'utf8',
  )
  return { binaryPath: installedBinary, directory, downloaded: true }
}
