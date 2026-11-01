import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSignedMacUpdateFixture,
  readMacBundleVersion
} from '../../../../../resources/scripts/fixtures/macos-update-fixture'
import {
  macUpdateStageRoot,
  prepareMacUpdate,
  validatePreparedMacUpdate
} from './macos-update-preparation'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe.runIf(process.platform === 'darwin')('macOS pre-quit preparation', () => {
  it('prepares signed bytes without replacing the installed app and reuses only a valid receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tuff-macos-prepare-'))
    roots.push(root)
    const fixture = await createSignedMacUpdateFixture(root)
    const oldInode = (await stat(fixture.appBundlePath)).ino
    const receipt = await prepareMacUpdate(fixture.input)
    const prepared = path.join(receipt.stageRoot, 'prepared.app')
    const preparedInode = (await stat(prepared)).ino
    expect(await readMacBundleVersion(fixture.appBundlePath)).toBe('2.4.9')
    expect((await stat(fixture.appBundlePath)).ino).toBe(oldInode)
    expect(await readMacBundleVersion(prepared)).toBe('2.4.10')
    expect(await validatePreparedMacUpdate(fixture.input)).toEqual(receipt)
    expect(await validatePreparedMacUpdate(fixture.input, { fast: true })).toEqual(receipt)
    await rm(fixture.packagePath)
    expect(await prepareMacUpdate(fixture.input)).toEqual(receipt)
    expect((await stat(prepared)).ino).toBe(preparedInode)
  })

  it.each(['version', 'identity', 'signature'] as const)(
    'rejects an incoming %s mismatch before touching the installed app',
    async (mismatch) => {
      const root = await mkdtemp(path.join(tmpdir(), 'tuff-macos-reject-'))
      roots.push(root)
      const fixture = await createSignedMacUpdateFixture(root)
      if (mismatch === 'signature') {
        await writeFile(
          path.join(fixture.incomingApp, 'Contents', 'Resources', 'payload.txt'),
          'tampered'
        )
      } else {
        await fixture.bundle(
          fixture.incomingApp,
          mismatch === 'version' ? '2.4.11' : '2.4.10',
          mismatch === 'identity' ? 'com.attacker.app' : 'com.tuff.ota-fixture'
        )
      }
      fixture.input.packageSha256 = await fixture.archive()
      await expect(prepareMacUpdate(fixture.input)).rejects.toThrow()
      expect(await readMacBundleVersion(fixture.appBundlePath)).toBe('2.4.9')
      expect(
        await readFile(
          path.join(fixture.appBundlePath, 'Contents', 'Resources', 'payload.txt'),
          'utf8'
        )
      ).toBe('payload:2.4.9')
    }
  )

  it.each(['package', 'receipt', 'sealed-resource', 'symlink'] as const)(
    'refuses reuse after %s tampering',
    async (tamper) => {
      const root = await mkdtemp(path.join(tmpdir(), 'tuff-macos-receipt-'))
      roots.push(root)
      const fixture = await createSignedMacUpdateFixture(root)
      const receipt = await prepareMacUpdate(fixture.input)
      if (tamper === 'package') fixture.input.packageSha256 = '0'.repeat(64)
      if (tamper === 'receipt') {
        await writeFile(
          path.join(fixture.attemptRoot, 'macos-prepared.json'),
          JSON.stringify({ ...receipt, stageRoot: root })
        )
      }
      if (tamper === 'sealed-resource') {
        await writeFile(
          path.join(receipt.stageRoot, 'prepared.app', 'Contents', 'Resources', 'payload.txt'),
          'tampered'
        )
      }
      if (tamper === 'symlink') {
        await rm(path.join(receipt.stageRoot, 'prepared.app'), { recursive: true })
        await symlink(fixture.incomingApp, path.join(receipt.stageRoot, 'prepared.app'))
      }
      await expect(validatePreparedMacUpdate(fixture.input)).rejects.toThrow()
      expect(await readMacBundleVersion(fixture.appBundlePath)).toBe('2.4.9')
    }
  )
})

it.each(['../escape', 'attempt/escape', '', '..'])(
  'rejects an escaping preparation attempt id %j',
  (attemptId) => {
    expect(() => macUpdateStageRoot('/Applications/Tuff.app', attemptId)).toThrow(
      'Invalid macOS update attempt id'
    )
  }
)
