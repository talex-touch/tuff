import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { resolveBundledScript } from './update-platform-adapter'

const execFileAsync = promisify(execFile)

export interface MacUpdatePreparationInput {
  attemptId: string
  attemptRoot: string
  appBundlePath: string
  packagePath: string
  packageSha256: string
  targetVersion: string
  resourcesPath: string
  appPath: string
  signal?: AbortSignal
}

export interface PreparedMacUpdate {
  schemaVersion: 1
  packageSha256: string
  targetVersion: string
  appBundlePath: string
  stageRoot: string
  bundleId: string
  codeDirectoryHash: string
}

export function macUpdateStageRoot(appBundlePath: string, attemptId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(attemptId)) throw new Error('Invalid macOS update attempt id')
  return path.join(path.dirname(appBundlePath), `.tuff-update-${attemptId}`)
}

async function readBundleValue(bundle: string, key: string): Promise<string> {
  const { stdout } = await execFileAsync(
    '/usr/libexec/PlistBuddy',
    ['-c', `Print :${key}`, path.join(bundle, 'Contents', 'Info.plist')],
    { timeout: 10_000, maxBuffer: 16 * 1024 }
  )
  return stdout.trim()
}

async function readCodeDirectoryHash(bundle: string, signal?: AbortSignal): Promise<string> {
  const { stderr } = await execFileAsync(
    '/usr/bin/codesign',
    ['--display', '--verbose=4', bundle],
    {
      timeout: 10_000,
      maxBuffer: 64 * 1024,
      signal
    }
  )
  const hash = /^CDHash=([a-f0-9]+)$/m.exec(stderr)?.[1]
  if (!hash) throw new Error('Prepared macOS application has no code-directory hash')
  return hash
}

/** Revalidate the actual prepared bytes, not just a receipt or an existing directory. */
export interface ValidatePreparedMacUpdateOptions {
  fast?: boolean
}

/** Revalidate the actual prepared bytes, not just a receipt or an existing directory. */
export async function validatePreparedMacUpdate(
  input: MacUpdatePreparationInput,
  options?: ValidatePreparedMacUpdateOptions
): Promise<PreparedMacUpdate> {
  const value: unknown = JSON.parse(
    await fs.readFile(path.join(input.attemptRoot, 'macos-prepared.json'), 'utf8')
  )
  if (!value || typeof value !== 'object') throw new Error('Missing macOS preparation receipt')
  const receipt = value as Partial<PreparedMacUpdate>
  const appBundlePath = await fs.realpath(input.appBundlePath)
  const stageRoot = macUpdateStageRoot(appBundlePath, input.attemptId)
  const stage = await fs.lstat(stageRoot)
  const destination = await fs.stat(path.dirname(appBundlePath))
  if (
    receipt.schemaVersion !== 1 ||
    receipt.packageSha256 !== input.packageSha256 ||
    receipt.targetVersion !== input.targetVersion ||
    receipt.appBundlePath !== appBundlePath ||
    receipt.stageRoot !== stageRoot ||
    typeof receipt.bundleId !== 'string' ||
    typeof receipt.codeDirectoryHash !== 'string' ||
    !stage.isDirectory() ||
    stage.isSymbolicLink() ||
    stage.dev !== destination.dev
  )
    throw new Error('Prepared macOS update does not match this installation')
  const preparedApp = path.join(stageRoot, 'prepared.app')
  const preparedStat = await fs.lstat(preparedApp)
  if (!preparedStat.isDirectory() || preparedStat.isSymbolicLink())
    throw new Error('Invalid prepared application directory')
  // In fast mode (during handoff), skip the recursive --deep traversal across all nested
  // frameworks and helpers: prepareMacUpdate already verified the entire bundle deeply when
  // prepared. Non-deep verify still strictly validates the top-level bundle, Info.plist and
  // sealed resources (CodeResources), while readCodeDirectoryHash confirms binary integrity.
  const verifyArgs = options?.fast
    ? ['--verify', '--strict', preparedApp]
    : ['--verify', '--deep', '--strict', preparedApp]
  await execFileAsync('/usr/bin/codesign', verifyArgs, {
    timeout: 120_000,
    maxBuffer: 64 * 1024,
    signal: input.signal
  })
  if (
    (await readBundleValue(preparedApp, 'CFBundleShortVersionString')) !== input.targetVersion ||
    (await readBundleValue(preparedApp, 'CFBundleIdentifier')) !== receipt.bundleId ||
    (await readBundleValue(appBundlePath, 'CFBundleIdentifier')) !== receipt.bundleId ||
    (await readCodeDirectoryHash(preparedApp, input.signal)) !== receipt.codeDirectoryHash
  )
    throw new Error('Prepared macOS application failed identity or integrity verification')
  return receipt as PreparedMacUpdate
}

export async function resolveMacSwapHelper(
  resourcesPath: string,
  appPath: string
): Promise<string> {
  const relativePath = path.join(
    'node_modules',
    '@talex-touch',
    'tuff-native',
    'build',
    'Release',
    'tuff-native-update'
  )
  for (const candidate of [
    path.join(resourcesPath, relativePath),
    path.join(resourcesPath, 'app.asar.unpacked', relativePath),
    path.join(appPath, relativePath)
  ]) {
    try {
      await fs.access(candidate, fs.constants.X_OK)
      return candidate
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  throw new Error('Bundled macOS atomic update helper is missing')
}

/** This runs while the old application remains usable. It never replaces or opens the app. */
export async function prepareMacUpdate(
  input: MacUpdatePreparationInput
): Promise<PreparedMacUpdate> {
  await resolveMacSwapHelper(input.resourcesPath, input.appPath)
  try {
    return await validatePreparedMacUpdate(input)
  } catch (error) {
    if (input.signal?.aborted) throw error
    // A missing, interrupted or outdated preparation is rebuilt from the verified package.
  }
  input.signal?.throwIfAborted()
  const appBundlePath = await fs.realpath(input.appBundlePath)
  const stageRoot = macUpdateStageRoot(appBundlePath, input.attemptId)
  await fs.mkdir(input.attemptRoot, { recursive: true, mode: 0o700 })
  await fs.mkdir(stageRoot, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  const stage = await fs.lstat(stageRoot)
  const destination = await fs.stat(path.dirname(appBundlePath))
  if (
    !stage.isDirectory() ||
    stage.isSymbolicLink() ||
    stage.uid !== process.getuid?.() ||
    stage.dev !== destination.dev
  ) {
    throw new Error('macOS preparation directory must be privately owned on the destination volume')
  }
  await fs.chmod(stageRoot, 0o700)
  const bundleId = await readBundleValue(appBundlePath, 'CFBundleIdentifier')
  const script = resolveBundledScript('macos-prepare-update.sh', input.resourcesPath, input.appPath)
  try {
    await execFileAsync(
      '/usr/bin/nice',
      [
        '-n',
        '10',
        '/bin/bash',
        script,
        '--source',
        input.packagePath,
        '--stage',
        stageRoot,
        '--version',
        input.targetVersion,
        '--bundle-id',
        bundleId,
        '--log',
        path.join(input.attemptRoot, 'macos-update.log')
      ],
      { timeout: 15 * 60_000, signal: input.signal, maxBuffer: 64 * 1024 }
    )
    input.signal?.throwIfAborted()
    const receipt: PreparedMacUpdate = {
      schemaVersion: 1,
      packageSha256: input.packageSha256,
      targetVersion: input.targetVersion,
      appBundlePath,
      stageRoot,
      bundleId,
      codeDirectoryHash: await readCodeDirectoryHash(
        path.join(stageRoot, 'prepared.app'),
        input.signal
      )
    }
    const receiptPath = path.join(input.attemptRoot, 'macos-prepared.json')
    await fs.writeFile(`${receiptPath}.tmp`, JSON.stringify(receipt), { mode: 0o600 })
    await fs.rename(`${receiptPath}.tmp`, receiptPath)
    return receipt
  } catch (error) {
    // Never recurse into a DMG that failed to detach. Keep that attempt for diagnosis.
    const mount = await fs
      .lstat(path.join(stageRoot, 'mount'))
      .catch((mountError: NodeJS.ErrnoException) => {
        if (mountError.code !== 'ENOENT') throw mountError
        return null
      })
    if (!mount || mount.dev === stage.dev) await fs.rm(stageRoot, { recursive: true, force: true })
    throw error
  }
}
