import { execFile } from 'node:child_process'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { buildPlatformInstallSpec } from '../../src/main/modules/update/services/update-platform-adapter'

const execFileAsync = promisify(execFile)
const applyScriptPath = fileURLToPath(new URL('./linux-apply-update.sh', import.meta.url))
const builderConfigPath = fileURLToPath(new URL('../../electron-builder.yml', import.meta.url))
const temporaryRoots: string[] = []

interface Fixture {
  root: string
  canary: string
  sourceAppImage: string
  destinationAppImage: string
  backupAppImage: string
  logFile: string
  relaunchArgsFile: string
  relaunchVersionFile: string
  childSecret: string
}

interface CommandFailure extends Error {
  code: number
  stdout: string
  stderr: string
}

interface BuilderConfig {
  extraResources?: Array<{ from?: string; to?: string }>
}

function shellEnvironment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.APPDIR
  delete environment.APPIMAGE
  delete environment.APPIMAGE_EXTRACT_AND_RUN
  return { ...environment, ...overrides }
}

async function writeFixtureAppImage(filePath: string, version: string): Promise<string> {
  const source = `#!/bin/bash
set -u
{
  printf '%s\\n' "$#"
  for arg in "$@"; do
    printf '%s\\n' "$arg"
  done
} > "$TUFF_TEST_RELAUNCH_ARGS"
printf '%s' '${version}' > "$TUFF_TEST_RELAUNCH_VERSION"
printf '%s\\n' "$TUFF_TEST_CHILD_SECRET"
printf '%s\\n' "$TUFF_TEST_CHILD_SECRET" >&2
`
  await writeFile(filePath, source)
  await chmod(filePath, 0o755)
  return source
}

async function createFixture(): Promise<Fixture> {
  const root = await mkdtemp(path.join(tmpdir(), 'tuff-linux-update-'))
  temporaryRoots.push(root)
  const canary = 'sensitive-token-must-not-leak'
  const sensitiveRoot = path.join(root, canary)
  await mkdir(sensitiveRoot, { recursive: true })

  const fixture: Fixture = {
    root,
    canary,
    sourceAppImage: path.join(sensitiveRoot, 'target.AppImage'),
    destinationAppImage: path.join(sensitiveRoot, 'current.AppImage'),
    backupAppImage: path.join(sensitiveRoot, 'previous.AppImage'),
    logFile: path.join(sensitiveRoot, 'linux-update.log'),
    relaunchArgsFile: path.join(root, 'relaunch-args.txt'),
    relaunchVersionFile: path.join(root, 'relaunch-version.txt'),
    childSecret: 'provider-key-must-not-leak'
  }
  await writeFixtureAppImage(fixture.sourceAppImage, 'new')
  await writeFixtureAppImage(fixture.destinationAppImage, 'old')
  return fixture
}

async function runApplyScript(
  fixture: Fixture,
  environment: Record<string, string>
): ReturnType<typeof execFileAsync> {
  return execFileAsync(
    '/bin/bash',
    [
      applyScriptPath,
      '--source',
      fixture.sourceAppImage,
      '--dest',
      fixture.destinationAppImage,
      '--backup',
      fixture.backupAppImage,
      '--pid',
      '999999999',
      '--log',
      fixture.logFile
    ],
    {
      env: shellEnvironment({
        APPIMAGE: fixture.destinationAppImage,
        TUFF_TEST_RELAUNCH_ARGS: fixture.relaunchArgsFile,
        TUFF_TEST_RELAUNCH_VERSION: fixture.relaunchVersionFile,
        TUFF_TEST_CHILD_SECRET: fixture.childSecret,
        ...environment
      }),
      timeout: 5_000
    }
  )
}

async function waitForFile(filePath: string): Promise<string> {
  const deadline = Date.now() + 2_000
  while (Date.now() < deadline) {
    try {
      return await readFile(filePath, 'utf8')
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
        throw error
      }
    }
    await delay(20)
  }
  throw new Error(`Timed out waiting for fixture output: ${path.basename(filePath)}`)
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

describe.runIf(process.platform !== 'win32')('linux update apply script', () => {
  it('is packaged at the first path resolved by the platform adapter', async () => {
    const config = parse(await readFile(builderConfigPath, 'utf8')) as BuilderConfig
    expect(config.extraResources).toContainEqual({
      from: 'resources/scripts/linux-apply-update.sh',
      to: 'resources/scripts/linux-apply-update.sh'
    })

    const root = await mkdtemp(path.join(tmpdir(), 'tuff-linux-packaged-helper-'))
    temporaryRoots.push(root)
    const resourcesPath = path.join(root, 'Resources')
    const packagedScript = path.join(resourcesPath, 'resources', 'scripts', 'linux-apply-update.sh')
    await mkdir(path.dirname(packagedScript), { recursive: true })
    await copyFile(applyScriptPath, packagedScript)

    const spec = buildPlatformInstallSpec({
      platform: 'linux',
      packagePath: path.join(root, 'target.AppImage'),
      currentVersion: '2.4.14-beta.14',
      previousAsset: null,
      rollbackFromVersion: null,
      attemptRoot: path.join(root, 'attempt'),
      resourcesPath,
      appPath: path.join(root, 'app'),
      appBundlePath: null,
      allowRecovery: false
    })

    expect(spec.handoff.args?.[0]).toBe(packagedScript)
  })

  it('replaces and backs up an AppImage while preserving the normal FUSE relaunch', async () => {
    const fixture = await createFixture()
    const oldAppImage = await readFile(fixture.destinationAppImage, 'utf8')
    const newAppImage = await readFile(fixture.sourceAppImage, 'utf8')

    const result = await runApplyScript(fixture, {
      APPDIR: path.join(fixture.root, '.mount_tuff123')
    })

    expect(await readFile(fixture.destinationAppImage, 'utf8')).toBe(newAppImage)
    expect(await readFile(fixture.backupAppImage, 'utf8')).toBe(oldAppImage)
    await expect(waitForFile(fixture.relaunchArgsFile)).resolves.toBe('0\n')
    await expect(waitForFile(fixture.relaunchVersionFile)).resolves.toBe('new')

    const output = `${result.stdout}${result.stderr}${await readFile(fixture.logFile, 'utf8')}`
    expect(output).not.toContain(fixture.canary)
    expect(output).not.toContain(fixture.childSecret)
  })

  it('relaunches with extraction when the source AppImage used the official no-FUSE environment', async () => {
    const fixture = await createFixture()

    await runApplyScript(fixture, { APPIMAGE_EXTRACT_AND_RUN: '1' })

    await expect(waitForFile(fixture.relaunchArgsFile)).resolves.toBe(
      '1\n--appimage-extract-and-run\n'
    )
    await expect(waitForFile(fixture.relaunchVersionFile)).resolves.toBe('new')
  })

  it('preserves the official extract-and-run environment presence semantics', async () => {
    const fixture = await createFixture()

    // The AppImage type 2 runtime checks getenv(), so even a value of "0" means
    // the source process is already running in extract-and-run mode.
    await runApplyScript(fixture, {
      APPDIR: path.join(fixture.root, '.mount_tuff123'),
      APPIMAGE_EXTRACT_AND_RUN: '0'
    })

    await expect(waitForFile(fixture.relaunchArgsFile)).resolves.toBe(
      '1\n--appimage-extract-and-run\n'
    )
  })

  it('does not infer no-FUSE mode from an extracted-looking APPDIR', async () => {
    const fixture = await createFixture()
    await runApplyScript(fixture, {
      APPDIR: path.join(fixture.root, `appimage_extracted_${'a'.repeat(32)}`)
    })
    await expect(waitForFile(fixture.relaunchArgsFile)).resolves.toBe('0\n')
  })

  it('rejects an extract-and-run signal for a different AppImage', async () => {
    const fixture = await createFixture()
    await runApplyScript(fixture, {
      APPIMAGE: path.join(fixture.root, 'different.AppImage'),
      APPIMAGE_EXTRACT_AND_RUN: '1'
    })
    await expect(waitForFile(fixture.relaunchArgsFile)).resolves.toBe('0\n')
  })

  it('keeps a missing deb package path out of stdout, stderr, and the helper log', async () => {
    const fixture = await createFixture()
    const missingDeb = path.join(path.dirname(fixture.sourceAppImage), 'missing.deb')
    const fakeBin = path.join(fixture.root, 'bin')
    const xdgOpen = path.join(fakeBin, 'xdg-open')
    await mkdir(fakeBin)
    await writeFile(xdgOpen, '#!/bin/bash\nexit 0\n')
    await chmod(xdgOpen, 0o755)

    const failure = await execFileAsync(
      '/bin/bash',
      [
        applyScriptPath,
        '--deb',
        missingDeb,
        '--dest',
        fixture.destinationAppImage,
        '--pid',
        '999999999',
        '--log',
        fixture.logFile
      ],
      {
        env: shellEnvironment({
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          TUFF_TEST_CHILD_SECRET: fixture.childSecret
        }),
        timeout: 5_000
      }
    ).then(
      () => null,
      (error: CommandFailure) => error
    )

    expect(failure).toMatchObject({ code: 1, stdout: '', stderr: '' })
    const log = await readFile(fixture.logFile, 'utf8')
    expect(log).toContain('deb package not found')
    expect(`${failure?.stdout}${failure?.stderr}${log}`).not.toContain(fixture.canary)
    expect(`${failure?.stdout}${failure?.stderr}${log}`).not.toContain(fixture.childSecret)
  })

  it('restores and relaunches the backup after a replacement failure without leaking paths', async () => {
    const fixture = await createFixture()
    const oldAppImage = await readFile(fixture.destinationAppImage, 'utf8')
    const fakeBin = path.join(fixture.root, 'bin')
    const cpWrapper = path.join(fakeBin, 'cp')
    const cpCountFile = path.join(fixture.root, 'cp-count.txt')
    await mkdir(fakeBin)
    await writeFile(
      cpWrapper,
      `#!/bin/bash
set -u
count=0
if [ -f "$TUFF_TEST_CP_COUNT" ]; then
  read -r count < "$TUFF_TEST_CP_COUNT"
fi
count=$((count + 1))
printf '%s' "$count" > "$TUFF_TEST_CP_COUNT"
if [ "$count" -eq 2 ]; then
  destination="\${!#}"
  printf 'corrupted replacement' > "$destination"
  exit 23
fi
exec "$TUFF_TEST_REAL_CP" "$@"
`
    )
    await chmod(cpWrapper, 0o755)

    const failure = await runApplyScript(fixture, {
      APPDIR: path.join(fixture.root, '.mount_tuff123'),
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      TUFF_TEST_CP_COUNT: cpCountFile,
      TUFF_TEST_REAL_CP: '/bin/cp'
    }).then(
      () => null,
      (error: CommandFailure) => error
    )

    expect(failure).toMatchObject({ code: 1, stdout: '', stderr: '' })
    expect(await readFile(cpCountFile, 'utf8')).toBe('3')
    expect(await readFile(fixture.destinationAppImage, 'utf8')).toBe(oldAppImage)
    expect(await readFile(fixture.backupAppImage, 'utf8')).toBe(oldAppImage)
    await expect(waitForFile(fixture.relaunchArgsFile)).resolves.toBe('0\n')
    await expect(waitForFile(fixture.relaunchVersionFile)).resolves.toBe('old')

    const log = await readFile(fixture.logFile, 'utf8')
    expect(log).toContain('AppImage replace failed, restoring backup')
    expect(`${failure?.stdout}${failure?.stderr}${log}`).not.toContain(fixture.canary)
    expect(`${failure?.stdout}${failure?.stderr}${log}`).not.toContain(fixture.childSecret)
  })
})
