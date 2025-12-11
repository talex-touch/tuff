/**
 * Flow Bus Module
 *
 * Plugin-to-plugin data flow transfer system.
 */

export { flowBus, FlowBus } from './flow-bus'
export { flowTargetRegistry, FlowTargetRegistry } from './target-registry'
export { flowSessionManager, FlowSessionManager } from './session-manager'
export { FlowBusIPC, initializeFlowBusIPC } from './ipc'
export { flowBusModule, FlowBusModule } from './module'
export { nativeShareService, NativeShareService, NATIVE_SHARE_TARGETS } from './native-share'
export {
  shareNotificationService,
  ShareNotificationService,
  type ShareNotificationConfig
} from './share-notification'
