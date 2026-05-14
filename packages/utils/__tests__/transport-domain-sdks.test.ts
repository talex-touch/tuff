import { describe, expect, it, vi } from 'vitest'
import {
  AgentsEvents,
  AppEvents,
  AccountEvents,
  AuthEvents,
  ClipboardEvents,
  CoreBoxRetainedEvents,
  NativeEvents,
  OpenerEvents,
  PermissionEvents,
  PluginEvents,
  StorageEvents,
  SyncEvents,
  TerminalEvents,
  UpdateEvents,
} from '../transport/events'
import { AssistantEvents } from '../transport/events/assistant'
import { createAgentsSdk } from '../transport/sdk/domains/agents'
import { createAgentStoreSdk } from '../transport/sdk/domains/agents-store'
import { createAppSdk } from '../transport/sdk/domains/app'
import { createIntelligenceSdk } from '../transport/sdk/domains/intelligence'
import { createNativeSdk } from '../transport/sdk/domains/native'
import { createPermissionSdk } from '../transport/sdk/domains/permission'
import { createSettingsSdk } from '../transport/sdk/domains/settings'
import { createStorageSdk } from '../transport/sdk/domains/storage'
import { createUpdateSdk } from '../transport/sdk/domains/update'

function createTransportMock() {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(async () => undefined),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
    stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: 'mock-stream',
    })),
  }
}

describe('transport domain sdk mappings', () => {
  it('update sdk maps check and settings events', async () => {
    const transport = createTransportMock()
    const sdk = createUpdateSdk(transport as any)

    await sdk.check({ force: true })
    await sdk.updateSettings({ autoDownload: true })

    expect(transport.send).toHaveBeenNthCalledWith(1, UpdateEvents.check, {
      force: true,
    })
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      UpdateEvents.updateSettings,
      {
        settings: { autoDownload: true },
      },
    )
  })

  it('settings sdk maps file index stream to typed transport stream', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)
    const onData = vi.fn()

    await sdk.fileIndex.streamProgress({ onData })

    expect(transport.stream).toHaveBeenCalledWith(
      AppEvents.fileIndex.progress,
      undefined,
      { onData },
    )
  })

  it('settings sdk maps index rebuild requests through typed transport events', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)

    await sdk.fileIndex.rebuild({ force: true })
    await sdk.appIndex.reindex({
      target: 'JSON Formatter',
      mode: 'keywords',
      force: true,
    })

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.fileIndex.rebuild,
      { force: true },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.reindex,
      {
        target: 'JSON Formatter',
        mode: 'keywords',
        force: true,
      },
    )
  })

  it('assistant events use typed transport metadata without changing event names', () => {
    expect(AssistantEvents.floatingBall.getRuntimeConfig.toEventName()).toBe(
      'assistant:floating-ball:get-runtime-config',
    )
    expect(AssistantEvents.floatingBall.getRuntimeConfig).toMatchObject({
      namespace: 'assistant',
      module: 'floating-ball',
      action: 'get-runtime-config',
    })
    expect(AssistantEvents.voice.submitText.toEventName()).toBe(
      'assistant:voice-panel:submit',
    )
    expect(AssistantEvents.voice.submitText).toMatchObject({
      namespace: 'assistant',
      module: 'voice-panel',
      action: 'submit',
    })
  })

  it('plugin widget events use typed transport metadata without changing event names', () => {
    expect(PluginEvents.widget.register.toEventName()).toBe(
      'plugin:widget:register',
    )
    expect(PluginEvents.widget.register).toMatchObject({
      namespace: 'plugin',
      module: 'widget',
      action: 'register',
    })
    expect(PluginEvents.widget.unregister.toEventName()).toBe(
      'plugin:widget:unregister',
    )
    expect(PluginEvents.widget.unregister).toMatchObject({
      namespace: 'plugin',
      module: 'widget',
      action: 'unregister',
    })
  })

  it('plugin storage open-in-editor event uses typed transport metadata without changing event name', () => {
    expect(PluginEvents.storage.openInEditor.toEventName()).toBe(
      'plugin:storage:open-in-editor',
    )
    expect(PluginEvents.storage.openInEditor).toMatchObject({
      namespace: 'plugin',
      module: 'storage',
      action: 'open-in-editor',
    })
  })

  it('sync lifecycle events expose canonical names and retained legacy aliases', () => {
    expect(SyncEvents.lifecycle.start.toEventName()).toBe(
      'sync:lifecycle:start',
    )
    expect(SyncEvents.lifecycle.start).toMatchObject({
      namespace: 'sync',
      module: 'lifecycle',
      action: 'start',
    })
    expect(SyncEvents.lifecycle.trigger.toEventName()).toBe(
      'sync:lifecycle:trigger',
    )
    expect(SyncEvents.legacy.start.toEventName()).toBe('sync:start')
    expect(SyncEvents.legacy.stop.toEventName()).toBe('sync:stop')
    expect(SyncEvents.legacy.trigger.toEventName()).toBe('sync:trigger')
  })

  it('terminal session events expose canonical names and retained legacy aliases', () => {
    expect(TerminalEvents.session.create.toEventName()).toBe(
      'terminal:session:create',
    )
    expect(TerminalEvents.session.create).toMatchObject({
      namespace: 'terminal',
      module: 'session',
      action: 'create',
    })
    expect(TerminalEvents.session.data.toEventName()).toBe(
      'terminal:session:data',
    )
    expect(TerminalEvents.legacy.create.toEventName()).toBe('terminal:create')
    expect(TerminalEvents.legacy.write.toEventName()).toBe('terminal:write')
    expect(TerminalEvents.legacy.kill.toEventName()).toBe('terminal:kill')
    expect(TerminalEvents.legacy.data.toEventName()).toBe('terminal:data')
    expect(TerminalEvents.legacy.exit.toEventName()).toBe('terminal:exit')
  })

  it('opener events expose canonical names and retained legacy aliases', () => {
    expect(OpenerEvents.plugin.open.toEventName()).toBe('plugin:opener:open')
    expect(OpenerEvents.install.request.toEventName()).toBe(
      'plugin:install:request',
    )
    expect(OpenerEvents.drop.install.toEventName()).toBe('plugin:drop:install')
    expect(OpenerEvents.app.resolve.toEventName()).toBe('opener:app:resolve')
    expect(OpenerEvents.app.resolve).toMatchObject({
      namespace: 'opener',
      module: 'app',
      action: 'resolve',
    })
    expect(OpenerEvents.legacy.openPlugin.toEventName()).toBe('@open-plugin')
    expect(OpenerEvents.legacy.installPlugin.toEventName()).toBe(
      '@install-plugin',
    )
    expect(OpenerEvents.legacy.installDevPlugin.toEventName()).toBe(
      'plugin:install-dev',
    )
    expect(OpenerEvents.legacy.dropPlugin.toEventName()).toBe('drop:plugin')
    expect(OpenerEvents.legacy.resolveApp.toEventName()).toBe('openers:resolve')
  })

  it('auth and account events expose canonical names and retained legacy aliases', () => {
    expect(AuthEvents.session.getState.toEventName()).toBe(
      'auth:session:get-state',
    )
    expect(AuthEvents.session.getState).toMatchObject({
      namespace: 'auth',
      module: 'session',
      action: 'get-state',
    })
    expect(AuthEvents.profile.update.toEventName()).toBe(
      'auth:profile:update',
    )
    expect(AuthEvents.device.getFingerprintHash.toEventName()).toBe(
      'auth:device:get-fingerprint-hash',
    )
    expect(AuthEvents.nexus.upload.toEventName()).toBe('auth:nexus:upload')
    expect(AuthEvents.stepUp.getToken.toEventName()).toBe(
      'auth:step-up:get-token',
    )
    expect(AuthEvents.legacy.getState.toEventName()).toBe('auth:get-state')
    expect(AuthEvents.legacy.nexusUpload.toEventName()).toBe(
      'auth:nexus-upload',
    )
    expect(AuthEvents.legacy.getFingerprintHash.toEventName()).toBe(
      'auth:get-fingerprint-hash',
    )

    expect(AccountEvents.auth.getToken.toEventName()).toBe(
      'account:auth:get-token',
    )
    expect(AccountEvents.sync.recordActivity.toEventName()).toBe(
      'account:sync:record-activity',
    )
    expect(AccountEvents.sync.recordActivity).toMatchObject({
      namespace: 'account',
      module: 'sync',
      action: 'record-activity',
    })
    expect(AccountEvents.legacy.getAuthToken.toEventName()).toBe(
      'account:get-auth-token',
    )
    expect(AccountEvents.legacy.recordSyncActivity.toEventName()).toBe(
      'account:record-sync-activity',
    )
  })

  it('corebox retained events expose canonical names and retained legacy aliases', () => {
    expect(CoreBoxRetainedEvents.beginner.shortcutTriggered.toEventName()).toBe(
      'beginner:shortcut:triggered',
    )
    expect(CoreBoxRetainedEvents.input.focus.toEventName()).toBe(
      'core-box:input:focus',
    )
    expect(CoreBoxRetainedEvents.input.focus).toMatchObject({
      namespace: 'core-box',
      module: 'input',
      action: 'focus',
    })
    expect(CoreBoxRetainedEvents.ui.resume.toEventName()).toBe(
      'core-box:ui:resume',
    )
    expect(CoreBoxRetainedEvents.ui.show.toEventName()).toBe(
      'core-box:ui:show',
    )
    expect(CoreBoxRetainedEvents.ui.hide.toEventName()).toBe(
      'core-box:ui:hide',
    )
    expect(CoreBoxRetainedEvents.ui.expand.toEventName()).toBe(
      'core-box:ui:expand',
    )
    expect(CoreBoxRetainedEvents.ui.focusWindow.toEventName()).toBe(
      'core-box:ui:focus-window',
    )
    expect(CoreBoxRetainedEvents.ui.getUIViewState.toEventName()).toBe(
      'core-box:ui:get-ui-view-state',
    )
    expect(CoreBoxRetainedEvents.ui.shortcutTriggered.toEventName()).toBe(
      'core-box:ui:shortcut-triggered',
    )
    expect(CoreBoxRetainedEvents.ui.uiModeExited.toEventName()).toBe(
      'core-box:ui:mode-exited',
    )
    expect(CoreBoxRetainedEvents.ui.hideInput.toEventName()).toBe(
      'core-box:ui:hide-input',
    )
    expect(CoreBoxRetainedEvents.ui.showInput.toEventName()).toBe(
      'core-box:ui:show-input',
    )
    expect(CoreBoxRetainedEvents.ui.focusWindow).toMatchObject({
      namespace: 'core-box',
      module: 'ui',
      action: 'focus-window',
    })
    expect(CoreBoxRetainedEvents.recommendation.get.toEventName()).toBe(
      'core-box:recommendation:get',
    )
    expect(CoreBoxRetainedEvents.recommendation.aggregateTimeStats.toEventName()).toBe(
      'core-box:recommendation:aggregate-time-stats',
    )
    expect(CoreBoxRetainedEvents.recommendation.isPinned.toEventName()).toBe(
      'core-box:recommendation:is-pinned',
    )
    expect(CoreBoxRetainedEvents.previewHistory.show.toEventName()).toBe(
      'core-box:preview-history:show',
    )
    expect(CoreBoxRetainedEvents.preview.copy.toEventName()).toBe(
      'core-box:preview:copy',
    )
    expect(CoreBoxRetainedEvents.actionPanel.open.toEventName()).toBe(
      'core-box:action-panel:open',
    )
    expect(CoreBoxRetainedEvents.metaOverlay.itemAction.toEventName()).toBe(
      'core-box:meta-overlay:item-action',
    )
    expect(CoreBoxRetainedEvents.legacy.beginnerShortcutTriggered.toEventName()).toBe(
      'beginner:shortcut-triggered',
    )
    expect(CoreBoxRetainedEvents.legacy.focusInput.toEventName()).toBe(
      'corebox:focus-input',
    )
    expect(CoreBoxRetainedEvents.legacy.openActionPanel.toEventName()).toBe(
      'corebox:open-action-panel',
    )
    expect(CoreBoxRetainedEvents.legacy.metaOverlayItemAction.toEventName()).toBe(
      'meta-overlay:item-action',
    )
    expect(CoreBoxRetainedEvents.legacy.show.toEventName()).toBe(
      'core-box:show',
    )
    expect(CoreBoxRetainedEvents.legacy.hide.toEventName()).toBe(
      'core-box:hide',
    )
    expect(CoreBoxRetainedEvents.legacy.expand.toEventName()).toBe(
      'core-box:expand',
    )
    expect(CoreBoxRetainedEvents.legacy.focusWindow.toEventName()).toBe(
      'core-box:focus-window',
    )
    expect(CoreBoxRetainedEvents.legacy.getUIViewState.toEventName()).toBe(
      'core-box:get-ui-view-state',
    )
    expect(CoreBoxRetainedEvents.legacy.shortcutTriggered.toEventName()).toBe(
      'core-box:shortcut-triggered',
    )
    expect(CoreBoxRetainedEvents.legacy.uiModeExited.toEventName()).toBe(
      'core-box:ui-mode-exited',
    )
    expect(CoreBoxRetainedEvents.legacy.hideInput.toEventName()).toBe(
      'core-box:hide-input',
    )
    expect(CoreBoxRetainedEvents.legacy.showInput.toEventName()).toBe(
      'core-box:show-input',
    )
    expect(CoreBoxRetainedEvents.legacy.allowInput.toEventName()).toBe(
      'core-box:allow-input',
    )
    expect(CoreBoxRetainedEvents.legacy.uiResume.toEventName()).toBe(
      'core-box:ui-resume',
    )
    expect(CoreBoxRetainedEvents.legacy.getRecommendations.toEventName()).toBe(
      'core-box:get-recommendations',
    )
    expect(CoreBoxRetainedEvents.legacy.aggregateTimeStats.toEventName()).toBe(
      'core-box:aggregate-time-stats',
    )
    expect(CoreBoxRetainedEvents.legacy.isPinned.toEventName()).toBe(
      'core-box:is-pinned',
    )
  })

  it('storage sdk maps app storage operations to typed storage events', async () => {
    const transport = createTransportMock()
    transport.send.mockResolvedValueOnce({ theme: 'dark' })
    const sdk = createStorageSdk(transport as any)
    const onData = vi.fn()

    await expect(sdk.app.get('app-setting.ini')).resolves.toEqual({
      theme: 'dark',
    })
    await sdk.app.save({ key: 'app-setting.ini', value: { theme: 'light' } })
    await sdk.app.streamUpdated({ onData })

    expect(transport.send).toHaveBeenNthCalledWith(1, StorageEvents.app.get, {
      key: 'app-setting.ini',
    })
    expect(transport.send).toHaveBeenNthCalledWith(2, StorageEvents.app.save, {
      key: 'app-setting.ini',
      value: { theme: 'light' },
    })
    expect(transport.stream).toHaveBeenCalledWith(
      StorageEvents.app.updated,
      undefined,
      { onData },
    )
  })

  it('clipboard metadata query event uses typed transport naming', () => {
    expect(ClipboardEvents.queryMeta.toEventName()).toBe(
      'clipboard:history:query-meta',
    )
    expect(ClipboardEvents.queryMeta).toMatchObject({
      namespace: 'clipboard',
      module: 'history',
      action: 'query-meta',
    })
  })

  it('native events and sdk use typed transport naming', async () => {
    const transport = createTransportMock()
    const sdk = createNativeSdk(transport as any)

    expect(NativeEvents.capabilities.list.toEventName()).toBe(
      'native:capabilities:list',
    )
    expect(NativeEvents.capabilities.get.toEventName()).toBe(
      'native:capabilities:get',
    )
    expect(NativeEvents.screenshot.getSupport.toEventName()).toBe(
      'native:screenshot:get-support',
    )
    expect(NativeEvents.screenshot.listDisplays.toEventName()).toBe(
      'native:screenshot:list-displays',
    )
    expect(NativeEvents.screenshot.capture.toEventName()).toBe(
      'native:screenshot:capture',
    )
    expect(NativeEvents.screenshot.capture).toMatchObject({
      namespace: 'native',
      module: 'screenshot',
      action: 'capture',
    })
    expect(NativeEvents.fileIndex.query.toEventName()).toBe(
      'native:file-index:query',
    )
    expect(NativeEvents.file.stat.toEventName()).toBe('native:file:stat')
    expect(NativeEvents.file.getThumbnail.toEventName()).toBe(
      'native:file:get-thumbnail',
    )
    expect(NativeEvents.media.probe.toEventName()).toBe('native:media:probe')

    await sdk.capabilities.list()
    await sdk.capabilities.get({ id: 'file.stat' })
    await sdk.screenshot.getSupport()
    await sdk.screenshot.listDisplays()
    await sdk.screenshot.capture({
      target: 'cursor-display',
      writeClipboard: true,
    })
    await sdk.fileIndex.query({ text: 'hello', limit: 3 })
    await sdk.file.stat({ path: '/tmp/a.png' })
    await sdk.file.getThumbnail({ path: '/tmp/a.png' })
    await sdk.media.probe({ path: '/tmp/a.png' })
    await sdk.fileIndex.streamProgress({ onData: vi.fn() })

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      NativeEvents.capabilities.list,
      undefined,
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      NativeEvents.capabilities.get,
      { id: 'file.stat' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      NativeEvents.screenshot.getSupport,
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      NativeEvents.screenshot.listDisplays,
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      5,
      NativeEvents.screenshot.capture,
      {
        target: 'cursor-display',
        writeClipboard: true,
      },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      6,
      NativeEvents.fileIndex.query,
      { text: 'hello', limit: 3 },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      7,
      NativeEvents.file.stat,
      { path: '/tmp/a.png' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      8,
      NativeEvents.file.getThumbnail,
      { path: '/tmp/a.png' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      9,
      NativeEvents.media.probe,
      { path: '/tmp/a.png' },
    )
    expect(transport.stream).toHaveBeenCalledWith(
      NativeEvents.fileIndex.progress,
      undefined,
      expect.objectContaining({ onData: expect.any(Function) }),
    )
  })

  it('settings sdk maps device idle diagnostic event', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)

    await sdk.deviceIdle.getDiagnostic()

    expect(transport.send).toHaveBeenCalledWith(
      AppEvents.deviceIdle.getDiagnostic,
    )
  })

  it('settings sdk maps managed app entry events through appIndex domain', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)

    await sdk.appIndex.listEntries()
    await sdk.appIndex.upsertEntry({
      path: '/Applications/ChatApp.app',
      displayName: '聊天应用',
      enabled: true,
    })
    await sdk.appIndex.removeEntry({ path: '/Applications/ChatApp.app' })
    await sdk.appIndex.setEntryEnabled({
      path: '/Applications/ChatApp.app',
      enabled: false,
    })

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.appIndex.listEntries,
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.upsertEntry,
      {
        path: '/Applications/ChatApp.app',
        displayName: '聊天应用',
        enabled: true,
      },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AppEvents.appIndex.removeEntry,
      {
        path: '/Applications/ChatApp.app',
      },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      AppEvents.appIndex.setEntryEnabled,
      {
        path: '/Applications/ChatApp.app',
        enabled: false,
      },
    )
  })

  it('settings sdk maps app search diagnostic and reindex through appIndex domain', async () => {
    const transport = createTransportMock()
    const sdk = createSettingsSdk(transport as any)

    await sdk.appIndex.diagnose({
      target: 'JSON Formatter',
      query: 'json formatter',
    })
    await sdk.appIndex.reindex({
      target: 'JSON Formatter',
      mode: 'keywords',
    })

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.appIndex.diagnose,
      {
        target: 'JSON Formatter',
        query: 'json formatter',
      },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.reindex,
      {
        target: 'JSON Formatter',
        mode: 'keywords',
      },
    )
  })

  it('app sdk maps openPromptsFolder to typed system event', async () => {
    const transport = createTransportMock()
    const sdk = createAppSdk(transport as any)

    await sdk.openPromptsFolder()

    expect(transport.send).toHaveBeenCalledWith(
      AppEvents.system.openPromptsFolder,
    )
  })

  it('intelligence sdk throws typed error when main returns failed ApiResponse', async () => {
    const transport = createTransportMock()
    transport.send.mockResolvedValueOnce({
      ok: false,
      error: 'quota exceeded',
    })

    const sdk = createIntelligenceSdk(transport as any)

    await expect(sdk.invoke('text.chat', { messages: [] })).rejects.toThrow(
      'quota exceeded',
    )
  })

  it('intelligence sdk maps core API calls through typed api events', async () => {
    const transport = createTransportMock()
    transport.send.mockResolvedValue({ ok: true, result: null })
    const sdk = createIntelligenceSdk(transport as any)

    await sdk.invoke('text.chat', { messages: [] })
    await sdk.ttsSpeak({ text: 'hello', language: 'en' })
    await sdk.testProvider({
      id: 'provider-1',
      type: 'openai',
      name: 'Provider 1',
      enabled: true,
      apiKey: 'test',
    } as any)
    await sdk.getQuota({ callerId: 'plugin.demo' })

    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      'intelligence:api:invoke',
    )
    expect(transport.send.mock.calls[0]?.[0]).toMatchObject({
      namespace: 'intelligence',
      module: 'api',
      action: 'invoke',
    })
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      'intelligence:api:tts-speak',
    )
    expect(transport.send.mock.calls[1]?.[0]).toMatchObject({
      namespace: 'intelligence',
      module: 'api',
      action: 'tts-speak',
    })
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      'intelligence:api:test-provider',
    )
    expect(transport.send.mock.calls[3]?.[0]?.toEventName?.()).toBe(
      'intelligence:api:get-quota',
    )
  })

  it('intelligence sdk maps session subscribe to typed transport stream', async () => {
    const transport = createTransportMock()
    const sdk = createIntelligenceSdk(transport as any)
    const onData = vi.fn()

    await sdk.agentSessionSubscribe(
      { sessionId: 'tis_1', fromSeq: 3 },
      { onData },
    )

    expect(transport.stream).toHaveBeenCalledTimes(1)
    const [event, payload, options] = transport.stream.mock.calls[0] || []
    expect(event?.toEventName?.()).toBe('intelligence:agent:session:subscribe')
    expect(event).toMatchObject({
      namespace: 'intelligence',
      module: 'agent',
      action: 'session:subscribe',
    })
    expect(payload).toEqual({ sessionId: 'tis_1', fromSeq: 3 })
    expect(options).toEqual({ onData })
  })

  it('intelligence sdk maps agent tool approval through typed event builder', async () => {
    const transport = createTransportMock()
    transport.send.mockResolvedValue({ ok: true, result: null })
    const sdk = createIntelligenceSdk(transport as any)

    await sdk.agentToolApprove({
      ticketId: 'ticket_1',
      approved: true,
      reason: 'reviewed',
    })

    const [event, payload] = transport.send.mock.calls[0] || []
    expect(event?.toEventName?.()).toBe('intelligence:agent:tool:approve')
    expect(event).toMatchObject({
      namespace: 'intelligence',
      module: 'agent',
      action: 'tool:approve',
    })
    expect(payload).toEqual({
      ticketId: 'ticket_1',
      approved: true,
      reason: 'reviewed',
    })
  })

  it('intelligence sdk subscribe throws when stream transport is unavailable', async () => {
    const transport = { send: vi.fn() }
    const sdk = createIntelligenceSdk(transport as any)

    await expect(
      sdk.agentSessionSubscribe({ sessionId: 'tis_1' }, { onData: vi.fn() }),
    ).rejects.toThrow('transport.stream is unavailable')
  })

  it('intelligence sdk maps workflow CRUD events through typed transport events', async () => {
    const transport = createTransportMock()
    transport.send.mockResolvedValue({ ok: true, result: undefined })
    const sdk = createIntelligenceSdk(transport as any)

    await sdk.workflowList({ includeTemplates: true })
    await sdk.workflowGet({ workflowId: 'wf_1' })
    await sdk.workflowSave({
      id: 'wf_1',
      name: '整理剪贴板',
      triggers: [],
      contextSources: [],
      toolSources: ['builtin'],
      steps: [],
    })
    await sdk.workflowDelete({ workflowId: 'wf_1' })
    await sdk.workflowRun({ workflowId: 'wf_1', sessionId: 'tis_1' })
    await sdk.workflowHistory({ workflowId: 'wf_1', limit: 10 })

    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      'intelligence:workflow:list',
    )
    expect(transport.send.mock.calls[0]?.[0]).toMatchObject({
      namespace: 'intelligence',
      module: 'workflow',
      action: 'list',
    })
    expect(transport.send.mock.calls[0]?.[1]).toEqual({
      includeTemplates: true,
    })
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      'intelligence:workflow:get',
    )
    expect(transport.send.mock.calls[1]?.[1]).toEqual({ workflowId: 'wf_1' })
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      'intelligence:workflow:save',
    )
    expect(transport.send.mock.calls[2]?.[1]).toEqual({
      id: 'wf_1',
      name: '整理剪贴板',
      triggers: [],
      contextSources: [],
      toolSources: ['builtin'],
      steps: [],
    })
    expect(transport.send.mock.calls[3]?.[0]?.toEventName?.()).toBe(
      'intelligence:workflow:delete',
    )
    expect(transport.send.mock.calls[3]?.[1]).toEqual({ workflowId: 'wf_1' })
    expect(transport.send.mock.calls[4]?.[0]?.toEventName?.()).toBe(
      'intelligence:workflow:run',
    )
    expect(transport.send.mock.calls[4]?.[1]).toEqual({
      workflowId: 'wf_1',
      sessionId: 'tis_1',
    })
    expect(transport.send.mock.calls[5]?.[0]?.toEventName?.()).toBe(
      'intelligence:workflow:history',
    )
    expect(transport.send.mock.calls[5]?.[1]).toEqual({
      workflowId: 'wf_1',
      limit: 10,
    })
  })

  it('permission sdk maps grant + push subscription', async () => {
    const transport = createTransportMock()
    const dispose = vi.fn()
    transport.on.mockReturnValue(dispose)

    const sdk = createPermissionSdk(transport as any)

    await sdk.grant({
      pluginId: 'demo',
      permissionId: 'intelligence.basic',
      grantedBy: 'user',
    })
    const unsubscribe = sdk.onUpdated(() => {})
    unsubscribe()

    expect(transport.send).toHaveBeenCalledWith(PermissionEvents.api.grant, {
      pluginId: 'demo',
      permissionId: 'intelligence.basic',
      grantedBy: 'user',
    })
    expect(transport.on).toHaveBeenCalledWith(
      PermissionEvents.push.updated,
      expect.any(Function),
    )
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('agent market sdk maps market event names through typed events', async () => {
    const transport = createTransportMock()
    const sdk = createAgentStoreSdk(transport as any)

    await sdk.searchAgents({ keyword: 'workflow' })
    await sdk.installAgent('community.workflow-agent', '1.0.0')
    await sdk.checkUpdates()

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AgentsEvents.store.search,
      { keyword: 'workflow' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.store.install,
      { agentId: 'community.workflow-agent', version: '1.0.0' },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AgentsEvents.store.checkUpdates,
    )
  })

  it('agents sdk maps api list/execute-immediate/update-priority events', async () => {
    const transport = createTransportMock()
    const sdk = createAgentsSdk(transport as any)

    await sdk.listAll()
    await sdk.executeImmediate({
      agentId: 'builtin.search-agent',
      type: 'execute',
      input: { query: 'hello' },
    })
    await sdk.updatePriority('task-1', 9)

    expect(AgentsEvents.api.listAll.toEventName()).toBe('agents:api:list-all')
    expect(AgentsEvents.api.executeImmediate.toEventName()).toBe(
      'agents:api:execute-immediate',
    )
    expect(AgentsEvents.api.updatePriority.toEventName()).toBe(
      'agents:api:update-priority',
    )
    expect(transport.send).toHaveBeenNthCalledWith(1, AgentsEvents.api.listAll)
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.api.executeImmediate,
      {
        agentId: 'builtin.search-agent',
        type: 'execute',
        input: { query: 'hello' },
      },
    )
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AgentsEvents.api.updatePriority,
      {
        taskId: 'task-1',
        priority: 9,
      },
    )
  })

  it('agents sdk maps task push subscriptions', async () => {
    const transport = createTransportMock()
    const dispose = vi.fn()
    transport.on.mockReturnValue(dispose)
    const sdk = createAgentsSdk(transport as any)

    const unsubscribe = sdk.onTaskStarted(() => {})
    unsubscribe()

    expect(AgentsEvents.push.taskStarted.toEventName()).toBe(
      'agents:push:task-started',
    )
    expect(transport.on).toHaveBeenCalledWith(
      AgentsEvents.push.taskStarted,
      expect.any(Function),
    )
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
