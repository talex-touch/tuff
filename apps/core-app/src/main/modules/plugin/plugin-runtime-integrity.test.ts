import path from 'node:path'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import compressing from 'compressing'
import { afterEach, describe, expect, it } from 'vitest'
import {
  type PackagedManifest,
  collectRequiredLocalWebcontentFiles,
  ensurePluginRuntimeIntegrity,
  mergePackagedManifestMetadata
} from './plugin-runtime-integrity'

type ManifestWithPackageFiles = PackagedManifest

async function createPluginDir(manifest: ManifestWithPackageFiles): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'plugin-integrity-test-'))
  const pluginDir = path.join(root, manifest.name)
  await fs.mkdir(pluginDir, { recursive: true })
  await fs.writeFile(
    path.join(pluginDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )
  await fs.writeFile(path.join(pluginDir, 'index.js'), 'module.exports = {}', 'utf-8')
  return pluginDir
}

async function createArchiveFromDir(sourceDir: string, archivePath: string): Promise<void> {
  await compressing.tar.compressDir(sourceDir, archivePath, { ignoreBase: true })
}

async function writeArchiveSource(
  root: string,
  manifest: ManifestWithPackageFiles,
  extraFiles: Record<string, string>
): Promise<string> {
  const sourceDir = path.join(root, `${manifest.name}-archive`)
  await fs.mkdir(sourceDir, { recursive: true })
  await fs.writeFile(
    path.join(sourceDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf-8'
  )

  for (const [relativePath, content] of Object.entries(extraFiles)) {
    const fullPath = path.join(sourceDir, relativePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf-8')
  }

  return sourceDir
}

describe('plugin-runtime-integrity', () => {
  const createdRoots: string[] = []

  afterEach(async () => {
    await Promise.all(
      createdRoots.splice(0).map(async (root) => fs.rm(root, { recursive: true, force: true }))
    )
  })

  it('collects local webcontent entry files from manifest features', () => {
    const requiredFiles = collectRequiredLocalWebcontentFiles({
      features: [
        { interaction: { type: 'webcontent', path: '/clipboard-manager' } },
        { interaction: { type: 'webcontent', path: 'views/panel.html' } },
        { interaction: { type: 'widget', path: 'widgets/demo.vue' } }
      ] as never
    })

    expect(requiredFiles).toEqual(['index.html', 'views/panel.html'])
  })

  it('repairs missing webcontent entry files from a sibling plugin archive', async () => {
    const installedManifest: ManifestWithPackageFiles = {
      name: 'clipboard-history',
      version: '1.1.0',
      description: 'clipboard',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      features: [
        {
          id: 'clipboard-history',
          name: 'Clipboard History',
          desc: 'clipboard',
          icon: { type: 'emoji', value: '📋' },
          push: false,
          platform: { windows: true, linux: true, darwin: true },
          commands: [],
          interaction: { type: 'webcontent', path: '/clipboard-manager' }
        }
      ],
      _files: {
        'index.js': 'sha',
        'clipboard-history-1.1.0.tpex': 'sha'
      },
      _signature: 'local-signature'
    }
    const pluginDir = await createPluginDir(installedManifest)
    createdRoots.push(path.dirname(pluginDir))

    const archiveManifest: ManifestWithPackageFiles = {
      ...installedManifest,
      _files: {
        'index.js': 'sha',
        'index.html': 'sha',
        'clipboard-manager.html': 'sha',
        'clipboard-history-1.1.0.tpex': 'sha'
      },
      _signature: 'archive-signature'
    }
    const archiveSourceDir = await writeArchiveSource(path.dirname(pluginDir), archiveManifest, {
      'index.js': 'module.exports = {}',
      'index.html': '<html>ok</html>',
      'clipboard-manager.html': '<html>clipboard</html>'
    })
    const archivePath = path.join(pluginDir, 'clipboard-history-1.1.0.tpex')
    await createArchiveFromDir(archiveSourceDir, archivePath)

    const result = await ensurePluginRuntimeIntegrity({
      pluginDir,
      manifest: installedManifest
    })

    expect(result.missingFiles).toEqual([])
    expect(result.repairedFiles).toEqual(['index.html'])
    expect(result.manifestUpdated).toBe(true)
    await expect(fs.readFile(path.join(pluginDir, 'index.html'), 'utf-8')).resolves.toContain('ok')

    const repairedManifest = JSON.parse(
      await fs.readFile(path.join(pluginDir, 'manifest.json'), 'utf-8')
    ) as ManifestWithPackageFiles
    expect(repairedManifest._files).toMatchObject({
      'index.html': 'sha',
      'clipboard-manager.html': 'sha'
    })
    expect(repairedManifest._signature).toBe('local-signature')
  })

  it('keeps missing files when no sibling archive is available', async () => {
    const manifest: ManifestWithPackageFiles = {
      name: 'clipboard-history',
      version: '1.1.0',
      description: 'clipboard',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      features: [
        {
          id: 'clipboard-history',
          name: 'Clipboard History',
          desc: 'clipboard',
          icon: { type: 'emoji', value: '📋' },
          push: false,
          platform: { windows: true, linux: true, darwin: true },
          commands: [],
          interaction: { type: 'webcontent', path: '/clipboard-manager' }
        }
      ]
    }
    const pluginDir = await createPluginDir(manifest)
    createdRoots.push(path.dirname(pluginDir))

    const result = await ensurePluginRuntimeIntegrity({
      pluginDir,
      manifest
    })

    expect(result.repairedFiles).toEqual([])
    expect(result.missingFiles).toEqual(['index.html'])
    expect(result.archivePath).toBeUndefined()
  })

  it('skips repair when the sibling archive manifest does not match plugin name', async () => {
    const installedManifest: ManifestWithPackageFiles = {
      name: 'clipboard-history',
      version: '1.1.0',
      description: 'clipboard',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      features: [
        {
          id: 'clipboard-history',
          name: 'Clipboard History',
          desc: 'clipboard',
          icon: { type: 'emoji', value: '📋' },
          push: false,
          platform: { windows: true, linux: true, darwin: true },
          commands: [],
          interaction: { type: 'webcontent', path: '/clipboard-manager' }
        }
      ]
    }
    const pluginDir = await createPluginDir(installedManifest)
    createdRoots.push(path.dirname(pluginDir))

    const archiveManifest: ManifestWithPackageFiles = {
      ...installedManifest,
      name: 'another-plugin',
      _files: {
        'index.html': 'sha'
      }
    }
    const archiveSourceDir = await writeArchiveSource(path.dirname(pluginDir), archiveManifest, {
      'index.html': '<html>unexpected</html>'
    })
    await createArchiveFromDir(
      archiveSourceDir,
      path.join(pluginDir, 'clipboard-history-1.1.0.tpex')
    )

    const result = await ensurePluginRuntimeIntegrity({
      pluginDir,
      manifest: installedManifest
    })

    expect(result.repairedFiles).toEqual([])
    expect(result.missingFiles).toEqual(['index.html'])
    expect(result.repairError).toContain('name mismatch')
  })

  it('preserves richer package metadata when saving manifest edits', () => {
    const merged = mergePackagedManifestMetadata(
      {
        _files: {
          'index.js': 'sha',
          'index.html': 'sha'
        },
        _signature: 'signed'
      },
      {
        name: 'clipboard-history',
        _files: {
          'index.js': 'sha'
        }
      }
    )

    expect(merged._files).toMatchObject({
      'index.js': 'sha',
      'index.html': 'sha'
    })
    expect(merged._signature).toBe('signed')
  })

  it('preserves hashed package metadata when edited manifest downgrades _files to an array', () => {
    const merged = mergePackagedManifestMetadata(
      {
        _files: {
          'index.js': 'sha',
          'index.html': 'sha'
        }
      },
      {
        name: 'clipboard-history',
        _files: ['index.js', 'index.html']
      }
    )

    expect(merged._files).toEqual({
      'index.js': 'sha',
      'index.html': 'sha'
    })
  })
})
