import fse from 'fs-extra'
import path from 'path'
import { session } from 'electron'
import { BaseModule } from './abstract-base-module'
import { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import { TalexEvents } from '../core/eventbus/touch-event'

export class ExtensionLoaderModule extends BaseModule {
  static key: symbol = Symbol.for('ExtensionLoader')
  name: ModuleKey = ExtensionLoaderModule.key

  private extensions: string[] = []

  constructor() {
    super(ExtensionLoaderModule.key, {
      create: true,
      dirName: 'extensions'
    })
  }

  async onInit({ file }: ModuleInitContext<TalexEvents>): Promise<void> {
    const extensionPath = file.dirPath!
    const extensions = fse.readdirSync(extensionPath)

    extensions.forEach((extension) => {
      console.log('[Extension] Loading extension', extension)

      this.extensions.push(extension)
      session.defaultSession.loadExtension(path.join(extensionPath, extension))
    })
  }

  onDestroy(): MaybePromise<void> {
    // TODO: Implement extension unloading if necessary
    console.log('[ExtensionLoader] ExtensionLoaderModule destroyed')
  }
}

const extensionLoaderModule = new ExtensionLoaderModule()

export { extensionLoaderModule }
