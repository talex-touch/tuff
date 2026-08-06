import type { LocalSkillConfig } from './skill-local-sources'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isLocalSkillId,
  listEnabledLocalSkills,
  localSkillId,
  normalizeLocalSkillConfig,
  parseSkillFrontmatter,
  readEnabledLocalSkill,
  readLocalSkill,
  scanLocalSkills,
  setLocalSkillConfigReader,
  withLocalSkillDir,
  withLocalSkillEnabled,
  withoutLocalSkillDir
} from './skill-local-sources'

// Real directories, real symlinks: the containment rules exist because of what
// the filesystem does with `..` and links, and a stubbed fs would only test the
// stub. `realpath` runs on the roots too — /var is a link to /private/var on
// macOS, so an unresolved expectation would fail for the wrong reason.
let root: string

async function writeSkill(dir: string, frontmatter: string, body = 'Body text'): Promise<string> {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'SKILL.md'), `${frontmatter}\n${body}\n`, 'utf8')
  return dir
}

function skillDoc(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n`
}

function config(overrides: Partial<LocalSkillConfig> = {}): LocalSkillConfig {
  return { dirs: [], disabledIds: [], ...overrides }
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'tuff-local-skills-')))
})

afterEach(async () => {
  setLocalSkillConfigReader(null)
  await rm(root, { recursive: true, force: true })
})

describe('frontmatter parsing', () => {
  it('takes name and description, quoted or not, and ignores everything else', () => {
    expect(
      parseSkillFrontmatter('---\nname: "Release notes"\ndescription: Ship it\nmode: agent\n---\nx')
    ).toEqual({ name: 'Release notes', description: 'Ship it' })
  })

  it('treats a missing or unterminated fence as no metadata rather than an error', () => {
    expect(parseSkillFrontmatter('# Just a heading')).toEqual({})
    expect(parseSkillFrontmatter('---\nname: Half written\n')).toEqual({})
  })
})

describe('config normalization', () => {
  it('drops non-string and blank entries and deduplicates', () => {
    expect(
      normalizeLocalSkillConfig({
        dirs: ['/a', '  ', '/a', 42, '/b'],
        disabledIds: ['local:1', 'local:1']
      })
    ).toEqual({ dirs: ['/a', '/b'], disabledIds: ['local:1'] })
  })

  it('falls back to empty for anything that is not a config object', () => {
    for (const value of [null, undefined, [], 'nope', 7]) {
      expect(normalizeLocalSkillConfig(value)).toEqual({ dirs: [], disabledIds: [] })
    }
  })
})

describe('scanning', () => {
  it('finds child skills and the root itself, sorted by name', async () => {
    await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))
    await writeSkill(join(root, 'lib', 'triage'), skillDoc('Triage', 'Sort issues'))
    await writeSkill(join(root, 'lib'), skillDoc('Library root', 'The root itself'))
    // Neither a directory nor a manifest holder: both are skipped silently.
    await writeFile(join(root, 'lib', 'README.md'), '# not a skill', 'utf8')
    await mkdir(join(root, 'lib', 'empty'), { recursive: true })

    const skills = await scanLocalSkills(config({ dirs: [join(root, 'lib')] }))

    expect(skills.map((skill) => skill.name)).toEqual(['Library root', 'Release notes', 'Triage'])
    expect(skills.map((skill) => skill.description)).toEqual([
      'The root itself',
      'Ship it',
      'Sort issues'
    ])
    expect(skills.every((skill) => skill.enabled)).toBe(true)
  })

  it('names a skill after its directory when the manifest declares nothing', async () => {
    await writeSkill(join(root, 'lib', 'nameless'), '# No frontmatter')

    const [skill] = await scanLocalSkills(config({ dirs: [join(root, 'lib')] }))

    expect(skill).toMatchObject({ name: 'nameless', description: '' })
  })

  it('follows a symlinked entry and reports the target as its path', async () => {
    const target = await writeSkill(join(root, 'elsewhere', 'audit'), skillDoc('Audit', 'Check it'))
    await mkdir(join(root, 'lib'), { recursive: true })
    await symlink(target, join(root, 'lib', 'audit-link'), 'dir')

    const [skill] = await scanLocalSkills(config({ dirs: [join(root, 'lib')] }))

    expect(skill).toMatchObject({ name: 'Audit', path: target })
    // The id follows the target, so linking the same skill from two roots lists
    // it once rather than twice under different ids.
    expect(skill!.id).toBe(localSkillId(target))
  })

  it('keeps one entry when two registered directories reach the same skill', async () => {
    const target = await writeSkill(join(root, 'shared', 'audit'), skillDoc('Audit', 'Check it'))
    await mkdir(join(root, 'lib'), { recursive: true })
    await symlink(target, join(root, 'lib', 'audit-link'), 'dir')

    const skills = await scanLocalSkills(
      config({ dirs: [join(root, 'lib'), join(root, 'shared')] })
    )

    expect(skills).toHaveLength(1)
  })

  it('stops at 50 skills in one directory', async () => {
    for (let index = 0; index < 55; index += 1) {
      const padded = String(index).padStart(3, '0')
      await writeSkill(join(root, 'lib', `skill-${padded}`), skillDoc(`Skill ${padded}`, ''))
    }

    expect(await scanLocalSkills(config({ dirs: [join(root, 'lib')] }))).toHaveLength(50)
  })

  it('contributes nothing for a directory that is gone, without failing the scan', async () => {
    await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))

    const skills = await scanLocalSkills(
      config({ dirs: [join(root, 'missing'), join(root, 'lib')] })
    )

    expect(skills.map((skill) => skill.name)).toEqual(['Release notes'])
  })

  it('marks a skill the user switched off and keeps it listed', async () => {
    const dir = await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))

    const skills = await scanLocalSkills(
      config({ dirs: [join(root, 'lib')], disabledIds: [localSkillId(dir)] })
    )

    expect(skills).toMatchObject([{ name: 'Release notes', enabled: false }])
  })
})

describe('reading a skill body', () => {
  it('returns the live file, so an edit lands on the next read', async () => {
    const dir = await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))
    const settings = config({ dirs: [join(root, 'lib')] })
    const id = localSkillId(dir)

    expect(await readLocalSkill(settings, id)).toContain('Body text')

    await writeFile(join(dir, 'SKILL.md'), `${skillDoc('Release notes', 'Ship it')}\nEdited\n`)
    expect(await readLocalSkill(settings, id)).toContain('Edited')
  })

  it('refuses a path instead of an id', async () => {
    await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))
    const settings = config({ dirs: [join(root, 'lib')] })

    for (const candidate of [
      '/etc/passwd',
      join(root, 'lib', 'release', 'SKILL.md'),
      '../../etc/passwd',
      'local:deadbeefcafe'
    ]) {
      await expect(readLocalSkill(settings, candidate)).rejects.toThrow(
        'not in a registered directory'
      )
    }
  })

  it('refuses a skill whose registered directory was removed', async () => {
    const dir = await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))
    const id = localSkillId(dir)

    await expect(readLocalSkill(config({ dirs: [] }), id)).rejects.toThrow(
      'not in a registered directory'
    )
  })

  it('refuses a skill the user switched off', async () => {
    const dir = await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))
    const id = localSkillId(dir)

    await expect(
      readLocalSkill(config({ dirs: [join(root, 'lib')], disabledIds: [id] }), id)
    ).rejects.toThrow('switched off')
  })

  it('refuses a manifest that is a symlink pointing out of its skill directory', async () => {
    const outside = join(root, 'secrets.md')
    await writeFile(outside, 'SSH KEYS', 'utf8')
    const dir = join(root, 'lib', 'escape')
    await mkdir(dir, { recursive: true })
    await symlink(outside, join(dir, 'SKILL.md'))

    const settings = config({ dirs: [join(root, 'lib')] })
    // The escape is refused at read time, and the entry never makes the list at
    // all — a scan reads the same manifest through the same check.
    expect(await scanLocalSkills(settings)).toEqual([])
    await expect(readLocalSkill(settings, localSkillId(resolve(dir)))).rejects.toThrow(
      'resolves outside its directory'
    )
  })
})

describe('registry edits', () => {
  it('resolves a directory before storing it and registers it once', async () => {
    const dir = join(root, 'lib')
    await mkdir(dir, { recursive: true })
    await symlink(dir, join(root, 'lib-link'), 'dir')

    const added = await withLocalSkillDir(config(), join(root, 'lib-link'))
    expect(added.dirs).toEqual([dir])
    expect((await withLocalSkillDir(added, dir)).dirs).toEqual([dir])
  })

  it('rejects a relative path and a directory that is not there', async () => {
    await expect(withLocalSkillDir(config(), 'tuff-skills')).rejects.toThrow('absolute path')
    await expect(withLocalSkillDir(config(), '   ')).rejects.toThrow('is required')
    await expect(withLocalSkillDir(config(), join(root, 'missing'))).rejects.toThrow(
      'does not exist'
    )
  })

  it('rejects a file dressed up as a directory', async () => {
    const file = join(root, 'skills.md')
    await writeFile(file, 'x', 'utf8')

    await expect(withLocalSkillDir(config(), file)).rejects.toThrow('not a directory')
  })

  it('removes a directory by the path it was stored under', () => {
    const settings = config({ dirs: ['/a', '/b'] })

    expect(withoutLocalSkillDir(settings, '/a').dirs).toEqual(['/b'])
    expect(withoutLocalSkillDir(settings, '/nope').dirs).toEqual(['/a', '/b'])
  })

  it('records only the switched-off ids, so a new skill arrives enabled', () => {
    const off = withLocalSkillEnabled(config(), 'local:abc', false)
    expect(off.disabledIds).toEqual(['local:abc'])
    expect(withLocalSkillEnabled(off, 'local:abc', true).disabledIds).toEqual([])
  })
})

describe('the reader the injection point uses', () => {
  it('yields nothing until the runtime wires a config', async () => {
    await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))

    expect(await listEnabledLocalSkills()).toEqual([])

    setLocalSkillConfigReader(() => config({ dirs: [join(root, 'lib')] }))
    expect(await listEnabledLocalSkills()).toMatchObject([{ name: 'Release notes' }])
  })

  it('lists and reads only what is switched on', async () => {
    const dir = await writeSkill(join(root, 'lib', 'release'), skillDoc('Release notes', 'Ship it'))
    const id = localSkillId(dir)
    let disabledIds: string[] = []
    setLocalSkillConfigReader(() => config({ dirs: [join(root, 'lib')], disabledIds }))

    expect(await readEnabledLocalSkill(id)).toContain('Body text')

    disabledIds = [id]
    expect(await listEnabledLocalSkills()).toEqual([])
    await expect(readEnabledLocalSkill(id)).rejects.toThrow('switched off')
  })
})

describe('id shape', () => {
  it('prefixes local ids so they never collide with an imported item id', () => {
    expect(localSkillId('/skills/release')).toMatch(/^local:[0-9a-f]{12}$/)
    expect(isLocalSkillId(localSkillId('/skills/release'))).toBe(true)
    expect(isLocalSkillId('item-1')).toBe(false)
  })
})
