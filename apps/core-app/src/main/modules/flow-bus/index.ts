/**
 * Flow Bus Module
 *
 * Plugin-to-plugin data flow transfer system.
 */

export { flowBus, FlowBus } from './flow-bus'
export { FlowBusIPC, initializeFlowBusIPC } from './ipc'
export { flowBusModule, FlowBusModule } from './module'
export { NATIVE_SHARE_TARGETS, nativeShareService, NativeShareService } from './native-share'
export { flowSessionManager, FlowSessionManager } from './session-manager'
export {
  type ShareNotificationConfig,
  shareNotificationService,
  ShareNotificationService
} from './share-notification'
export { flowTargetRegistry, FlowTargetRegistry } from './target-registry'
