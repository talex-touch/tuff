import type { ModuleInitContext, ModuleKey, ModuleStartContext } from '@talex-touch/utils'
import type { TalexEvents } from '../core/eventbus/touch-event'
import path from 'node:path'
import { getLogger } from '@talex-touch/utils/common/logger'
import { session } from 'electron'
import fse from 'fs-extra'
import { BaseModule } from './abstract-base-module'

const extensionLoaderLog = getLogger('extension-loader')

interface LoadedExtensionRecord {
  id: string
  name: string
  path: string
}

export class ExtensionLoaderModule extends BaseModule {
  static key: symbol = Symbol.for('ExtensionLoader')
  name: ModuleKey = ExtensionLoaderModule.key

  private extensions: string[] = []
  private loadedExtensions: LoadedExtensionRecord[] = []
  private extensionPath: string | null = null
  private loadPromise: Promise<void> | null = null
  private destroying = false

  constructor() {
    super(ExtensionLoaderModule.key, {
      create: true,
      dirName: 'extensions'
    })
  }

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const extensionPath = file.dirPath!
    this.extensionPath = extensionPath
    this.destroying = false

    try {
      this.extensions = await fse.readdir(extensionPath)
    } catch (error) {
      this.extensions = []
      extensionLoaderLog.error('Failed to list extensions directory', {
        error,
        meta: { path: extensionPath }
      })
    }
  }

  start(_ctx: ModuleStartContext<TalexEvents>): void {
    this.scheduleBackgroundLoad()
  }

  private scheduleBackgroundLoad(): void {
    if (this.loadPromise || !this.extensionPath || this.extensions.length === 0) {
      return
    }

    const extensionPath = this.extensionPath
    const extensions = [...this.extensions]
    this.loadPromise = this.loadExtensions(extensionPath, extensions)
  }

  private async loadExtensions(extensionPath: string, extensions: string[]): Promise<void> {
    const startedAt = performance.now()

    for (const extension of extensions) {
      if (this.destroying) {
        break
      }

      const fullPath = path.join(extensionPath, extension)
      try {
        const loaded = await session.defaultSession.loadExtension(fullPath)
        if (this.destroying) {
          this.removeLoadedExtension({
            id: loaded.id,
            name: loaded.name,
            path: fullPath
          })
          continue
        }

        this.loadedExtensions.push({
          id: loaded.id,
          name: loaded.name,
          path: fullPath
        })
        extensionLoaderLog.info(`Loaded extension: ${loaded.name}`, {
          meta: { id: loaded.id, path: fullPath }
        })
      } catch (error) {
        extensionLoaderLog.error(`Failed to load extension: ${extension}`, {
          error,
          meta: { path: fullPath }
        })
      }
    }

    extensionLoaderLog.info('Extension background load finished', {
      meta: {
        total: extensions.length,
        loaded: this.loadedExtensions.length,
        durationMs: Math.round(performance.now() - startedAt)
      }
    })
  }

  private removeLoadedExtension(extension: LoadedExtensionRecord): void {
    try {
      session.defaultSession.removeExtension(extension.id)
      extensionLoaderLog.info(`Unloaded extension: ${extension.name}`, {
        meta: { id: extension.id, path: extension.path }
      })
    } catch (error) {
      extensionLoaderLog.error(`Failed to unload extension: ${extension.name}`, {
        error,
        meta: { id: extension.id, path: extension.path }
      })
    }
  }

  async onDestroy(): Promise<void> {
    this.destroying = true
    if (this.loadPromise) {
      try {
        await this.loadPromise
      } catch (error) {
        extensionLoaderLog.error('Extension background load failed during destroy', { error })
      }
    }

    for (const extension of [...this.loadedExtensions].reverse()) {
      this.removeLoadedExtension(extension)
    }
    this.loadedExtensions = []
    this.extensions = []
    this.extensionPath = null
    this.loadPromise = null
    extensionLoaderLog.info('ExtensionLoaderModule destroyed')
  }
}

const extensionLoaderModule = new ExtensionLoaderModule()

export { extensionLoaderModule }
