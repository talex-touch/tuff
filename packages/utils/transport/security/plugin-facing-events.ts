import {
  AppEvents,
  ClipboardEvents,
  CoreBoxEvents,
  DivisionBoxEvents,
  FlowEvents,
  MetaOverlayEvents,
  NetworkEvents,
  PluginEvents,
  QuickOpsEvents,
  ScreenshotSessionEvents,
  TransportEvents,
} from '../events'
import {
  intelligenceApiEvents,
  intelligenceContextEvents,
  intelligenceKnowledgeEvents,
} from '../sdk/domains/intelligence'

/**
 * The complete Intelligence event surface reachable through the plugin facade.
 *
 * The facade delegates to the domain SDK, so these events are not visible to a
 * source scan of `packages/utils/plugin/**`. Keep this manifest explicit: adding
 * a domain method must not silently make another Intelligence handler plugin-facing.
 */
export const PLUGIN_FACING_INTELLIGENCE_EVENTS = [
  intelligenceApiEvents.invoke,
  intelligenceApiEvents.stream,
  intelligenceApiEvents.ttsSpeak,
  intelligenceApiEvents.chatLangChain,
  intelligenceApiEvents.getCapabilityTestMeta,
  intelligenceApiEvents.getCapabilityStatus,
  intelligenceApiEvents.getProviderModelOptions,
  intelligenceContextEvents.execute,
  intelligenceContextEvents.stream,
  intelligenceContextEvents.evaluateMemory,
  intelligenceKnowledgeEvents.indexDocument,
  intelligenceKnowledgeEvents.indexChunk,
  intelligenceKnowledgeEvents.search,
  intelligenceKnowledgeEvents.buildContext,
] as const

/**
 * Every event a plugin surface is allowed to reach on the main process.
 *
 * `TuffMainTransport.on()` and `onStream()` bind each handler to both
 * `BRIDGE_CHANNEL.MAIN` and `BRIDGE_CHANNEL.PLUGIN`, and the plugin-view preload puts
 * no filter on the event name a plugin's page may send. Every one of the ~414 handlers the
 * main process registers was therefore reachable from any plugin view, and whether that
 * mattered came down to whether the individual handler happened to inspect
 * `context.plugin` — 67 of them did (#688).
 *
 * This is the default-deny half. A handler is bound to the plugin channel only if its event
 * is named here; everything else is host-only, and a plugin asking for it gets no handler
 * rather than an answer.
 *
 * Direct plugin SDK sends are derived from `packages/utils/plugin/**`. Domain SDK
 * facades are indirect and therefore use an explicit manifest above.
 * `plugin-facing-events.test.ts` checks both sources in both directions.
 *
 * Being on this list is not authorization. It decides whether a plugin can be *heard*, not
 * whether it is *allowed* — the permission guard and each handler's own
 * `context.plugin` checks still apply.
 */
export const PLUGIN_FACING_EVENTS = [
  // AppEvents — 6
  AppEvents.fileIndex.batteryLevel,
  AppEvents.power.batteryStatus,
  AppEvents.system.captureSelection,
  AppEvents.system.getActiveApp,
  AppEvents.system.resolveApplication,
  AppEvents.window.show,

  // ClipboardEvents — 15
  ClipboardEvents.apply,
  ClipboardEvents.change,
  ClipboardEvents.clear,
  ClipboardEvents.clearHistory,
  ClipboardEvents.copyAndPaste,
  ClipboardEvents.delete,
  ClipboardEvents.getHistory,
  ClipboardEvents.getImageUrl,
  ClipboardEvents.getLatest,
  ClipboardEvents.getStatus,
  ClipboardEvents.read,
  ClipboardEvents.readFiles,
  ClipboardEvents.readImage,
  ClipboardEvents.setFavorite,
  ClipboardEvents.write,

  // CoreBoxEvents — 16
  CoreBoxEvents.clipboard.allow,
  CoreBoxEvents.input.change,
  CoreBoxEvents.input.clear,
  CoreBoxEvents.input.get,
  CoreBoxEvents.input.set,
  CoreBoxEvents.inputMonitoring.allow,
  CoreBoxEvents.item.clear,
  CoreBoxEvents.layout.getBounds,
  CoreBoxEvents.layout.setHeight,
  CoreBoxEvents.layout.setPositionOffset,
  CoreBoxEvents.metaOverlay.actionExecuted,
  CoreBoxEvents.ui.expand,
  CoreBoxEvents.ui.hide,
  CoreBoxEvents.ui.hideInput,
  CoreBoxEvents.ui.show,
  CoreBoxEvents.ui.showInput,

  // DivisionBoxEvents — 5
  DivisionBoxEvents.close,
  DivisionBoxEvents.getState,
  DivisionBoxEvents.open,
  DivisionBoxEvents.stateChanged,
  DivisionBoxEvents.updateState,

  // FlowEvents — 9
  FlowEvents.acknowledge,
  FlowEvents.cancel,
  FlowEvents.deliver,
  FlowEvents.dispatch,
  FlowEvents.getTargets,
  FlowEvents.nativeShare,
  FlowEvents.reportError,
  FlowEvents.sessionUpdate,
  FlowEvents.setPluginHandler,

  // MetaOverlayEvents — 2
  MetaOverlayEvents.action.register,
  MetaOverlayEvents.action.unregister,

  // NetworkEvents — 1
  NetworkEvents.api.request,

  // Intelligence domain facade — 14
  ...PLUGIN_FACING_INTELLIGENCE_EVENTS,

  // PluginEvents — 36
  PluginEvents.communicate.index,
  PluginEvents.i18n.getLocale,
  PluginEvents.i18n.resolveText,
  PluginEvents.lexicon.register,
  PluginEvents.lexicon.resolve,
  PluginEvents.lexicon.search,
  PluginEvents.performance.getMetrics,
  PluginEvents.performance.getPaths,
  PluginEvents.service.handle,
  PluginEvents.service.register,
  PluginEvents.service.unregister,
  PluginEvents.shortcut.register,
  PluginEvents.shortcut.trigger,
  PluginEvents.sqlite.execute,
  PluginEvents.sqlite.query,
  PluginEvents.sqlite.transaction,
  PluginEvents.storage.clear,
  PluginEvents.storage.deleteFile,
  PluginEvents.storage.deleteSecret,
  PluginEvents.storage.getFile,
  PluginEvents.storage.getFileDetails,
  PluginEvents.storage.getSecret,
  PluginEvents.storage.getSecretHealth,
  PluginEvents.storage.getStats,
  PluginEvents.storage.getTree,
  PluginEvents.storage.listFiles,
  PluginEvents.storage.openFolder,
  PluginEvents.storage.setFile,
  PluginEvents.storage.setSecret,
  PluginEvents.storage.setSecretBatch,
  PluginEvents.storage.update,
  PluginEvents.tempFile.create,
  PluginEvents.tempFile.delete,
  PluginEvents.window.command,
  PluginEvents.window.new,
  PluginEvents.window.visible,

  // QuickOpsEvents — 21
  QuickOpsEvents.audit.get,
  QuickOpsEvents.batteryStatus.get,
  QuickOpsEvents.capabilities.get,
  QuickOpsEvents.commonDirectory.get,
  QuickOpsEvents.developerPreview.get,
  QuickOpsEvents.developerPreview.save,
  QuickOpsEvents.directoryUsage.get,
  QuickOpsEvents.diskSpace.get,
  QuickOpsEvents.dnsQuery.get,
  QuickOpsEvents.fileBase64.get,
  QuickOpsEvents.fileHash.get,
  QuickOpsEvents.formatText.get,
  QuickOpsEvents.networkStatus.get,
  QuickOpsEvents.pathFormat.get,
  QuickOpsEvents.portStatus.get,
  QuickOpsEvents.queryLocalIp.get,
  QuickOpsEvents.recentDownload.get,
  QuickOpsEvents.sessions.get,
  QuickOpsEvents.systemInfo.get,
  QuickOpsEvents.systemProxy.get,
  QuickOpsEvents.tuffDiagnostics.get,

  // ScreenshotSessionEvents — 2
  ScreenshotSessionEvents.lifecycle.start,
  ScreenshotSessionEvents.lifecycle.waitResult,

  // TransportEvents — 4
  TransportEvents.port.close,
  TransportEvents.port.confirm,
  TransportEvents.port.error,
  TransportEvents.port.upgrade,
] as const

const PLUGIN_FACING_EVENT_NAMES: ReadonlySet<string> = new Set(PLUGIN_FACING_EVENTS.map(event => event.toEventName()))

/** Whether a plugin surface may reach this event at all. */
export function isPluginFacingEvent(eventName: string): boolean {
  return PLUGIN_FACING_EVENT_NAMES.has(eventName)
}

/** Resolved names, for diagnostics and tests. */
export function pluginFacingEventNames(): string[] {
  return [...PLUGIN_FACING_EVENT_NAMES].sort()
}
