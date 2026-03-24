import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
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

  constructor() {
    super(ExtensionLoaderModule.key, {
      create: true,
      dirName: 'extensions'
    })
  }

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const extensionPath = file.dirPath!
    const extensions = fse.readdirSync(extensionPath)

    for (const extension of extensions) {
      const fullPath = path.join(extensionPath, extension)
      this.extensions.push(extension)
      try {
        const loaded = await session.defaultSession.loadExtension(fullPath)
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
  }

  async onDestroy(): Promise<void> {
    for (const extension of [...this.loadedExtensions].reverse()) {
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
    this.loadedExtensions = []
    this.extensions = []
    extensionLoaderLog.info('ExtensionLoaderModule destroyed')
  }
}

const extensionLoaderModule = new ExtensionLoaderModule()

export { extensionLoaderModule }
