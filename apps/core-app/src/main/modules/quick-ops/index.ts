import type {
  MaybePromise,
  ModuleDestroyContext,
  ModuleInitContext,
  ModuleKey,
  ModuleStopContext
} from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import { BaseModule } from '../abstract-base-module'
import { quickOpsProvider } from '../box-tool/addon/quick-ops/quick-ops-provider'

export class QuickOpsModule extends BaseModule<TalexEvents> {
  static key: symbol = Symbol.for('QuickOps')
  name: ModuleKey = QuickOpsModule.key

  constructor() {
    super(QuickOpsModule.key, {
      create: false
    })
  }

  onInit(_ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {}

  stop(ctx: ModuleStopContext<TalexEvents>): MaybePromise<void> {
    quickOpsProvider.cleanup(`module-stop:${ctx.reason}`)
  }

  onDestroy(_ctx: ModuleDestroyContext<TalexEvents>): MaybePromise<void> {
    quickOpsProvider.cleanup('module-destroy')
  }

  getProvider(): typeof quickOpsProvider {
    return quickOpsProvider
  }
}

export const quickOpsModule = new QuickOpsModule()
