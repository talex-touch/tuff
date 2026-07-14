import { describe, expect, it, vi } from "vitest";
import {
  AccountEvents,
  AgentsEvents,
  AppEvents,
  AuthEvents,
  ClipboardEvents,
  CoreBoxEvents,
  CoreBoxRetainedEvents,
  NativeEvents,
  OpenerEvents,
  PermissionEvents,
  PluginEvents,
  QuickOpsEvents,
  StorageEvents,
  SyncEvents,
  TerminalEvents,
  TuffEvents,
  UpdateEvents,
} from "../transport/events";
import { AssistantEvents } from "../transport/events/assistant";
import { createAgentsSdk } from "../transport/sdk/domains/agents";
import { createAgentStoreSdk } from "../transport/sdk/domains/agents-store";
import { createAppSdk } from "../transport/sdk/domains/app";
import { createIntelligenceSdk } from "../transport/sdk/domains/intelligence";
import {
  createNativeSdk,
  createNativeScreenshotSdk,
} from "../transport/sdk/domains/native";
import { createPermissionSdk } from "../transport/sdk/domains/permission";
import { createQuickOpsSdk } from "../transport/sdk/domains/quick-ops";
import { createSettingsSdk } from "../transport/sdk/domains/settings";
import { createStorageSdk } from "../transport/sdk/domains/storage";
import { createUpdateSdk } from "../transport/sdk/domains/update";

function createTransportMock() {
  return {
    send: vi.fn<(...args: any[]) => Promise<any>>(async () => undefined),
    on: vi.fn<(...args: any[]) => any>(() => vi.fn()),
    stream: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      cancel: vi.fn(),
      cancelled: false,
      streamId: "mock-stream",
    })),
  };
}

describe("transport domain sdk mappings", () => {
  it("update sdk maps check and settings events", async () => {
    const transport = createTransportMock();
    const sdk = createUpdateSdk(transport as any);

    await sdk.check({ force: true });
    await sdk.updateSettings({ autoDownload: true });

    expect(transport.send).toHaveBeenNthCalledWith(1, UpdateEvents.check, {
      force: true,
    });
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      UpdateEvents.updateSettings,
      {
        settings: { autoDownload: true },
      },
    );
  });

  it("settings sdk maps file index stream to typed transport stream", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);
    const onData = vi.fn();

    await sdk.fileIndex.streamProgress({ onData });

    expect(transport.stream).toHaveBeenCalledWith(
      AppEvents.fileIndex.progress,
      undefined,
      { onData },
    );
  });

  it("settings sdk maps index rebuild requests through typed transport events", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.fileIndex.rebuild({ force: true });
    await sdk.appIndex.reindex({
      target: "JSON Formatter",
      mode: "keywords",
      force: true,
    });

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.fileIndex.rebuild,
      { force: true },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.reindex,
      {
        target: "JSON Formatter",
        mode: "keywords",
        force: true,
      },
    );
  });

  it("settings sdk maps indexed source maintenance through typed transport events", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.indexedSource.getDiagnostics({ sourceId: "browser-bookmarks" });
    await sdk.indexedSource.reset({
      sourceId: "browser-bookmarks",
      reason: "user-clear",
      clearSearchIndex: true,
    });
    await sdk.indexedSource.reconcile({
      sourceId: "browser-bookmarks",
      reason: "manual-repair",
    });
    await sdk.indexedSource.scan({
      sourceId: "browser-bookmarks",
      reason: "manual-rebuild",
    });
    await sdk.indexedSource.getProviderConfig();
    await sdk.indexedSource.updateProviderConfig({
      providers: [{ providerId: "file-provider", enabled: true, order: 20 }],
    });

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.indexedSource.diagnostics,
      { sourceId: "browser-bookmarks" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.indexedSource.reset,
      {
        sourceId: "browser-bookmarks",
        reason: "user-clear",
        clearSearchIndex: true,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AppEvents.indexedSource.reconcile,
      {
        sourceId: "browser-bookmarks",
        reason: "manual-repair",
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      AppEvents.indexedSource.scan,
      {
        sourceId: "browser-bookmarks",
        reason: "manual-rebuild",
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      5,
      AppEvents.indexedSource.providerConfigGet,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      6,
      AppEvents.indexedSource.providerConfigUpdate,
      {
        providers: [{ providerId: "file-provider", enabled: true, order: 20 }],
      },
    );
  });

  it("assistant events use typed transport metadata without changing event names", () => {
    expect(AssistantEvents.floatingBall.getRuntimeConfig.toEventName()).toBe(
      "assistant:floating-ball:get-runtime-config",
    );
    expect(AssistantEvents.floatingBall.getRuntimeConfig).toMatchObject({
      namespace: "assistant",
      module: "floating-ball",
      action: "get-runtime-config",
    });
    expect(AssistantEvents.voice.submitText.toEventName()).toBe(
      "assistant:voice-panel:submit",
    );
    expect(AssistantEvents.voice.submitText).toMatchObject({
      namespace: "assistant",
      module: "voice-panel",
      action: "submit",
    });
    expect(AssistantEvents.voice.captureScreenshot.toEventName()).toBe(
      "assistant:voice-panel:capture-screenshot",
    );
    expect(AssistantEvents.voice.captureScreenshot).toMatchObject({
      namespace: "assistant",
      module: "voice-panel",
      action: "capture-screenshot",
    });
    expect(AssistantEvents.voice.saveScreenshot.toEventName()).toBe(
      "assistant:voice-panel:save-screenshot",
    );
    expect(AssistantEvents.voice.saveScreenshot).toMatchObject({
      namespace: "assistant",
      module: "voice-panel",
      action: "save-screenshot",
    });
    expect(AssistantEvents.voice.translateScreenshot.toEventName()).toBe(
      "assistant:voice-panel:translate-screenshot",
    );
    expect(AssistantEvents.voice.translateScreenshot).toMatchObject({
      namespace: "assistant",
      module: "voice-panel",
      action: "translate-screenshot",
    });
  });

  it("plugin widget events use typed transport metadata without changing event names", () => {
    expect(PluginEvents.widget.register.toEventName()).toBe(
      "plugin:widget:register",
    );
    expect(PluginEvents.widget.register).toMatchObject({
      namespace: "plugin",
      module: "widget",
      action: "register",
    });
    expect(PluginEvents.widget.unregister.toEventName()).toBe(
      "plugin:widget:unregister",
    );
    expect(PluginEvents.widget.unregister).toMatchObject({
      namespace: "plugin",
      module: "widget",
      action: "unregister",
    });
  });

  it("plugin storage open-in-editor event uses typed transport metadata without changing event name", () => {
    expect(PluginEvents.storage.openInEditor.toEventName()).toBe(
      "plugin:storage:open-in-editor",
    );
    expect(PluginEvents.storage.openInEditor).toMatchObject({
      namespace: "plugin",
      module: "storage",
      action: "open-in-editor",
    });
  });

  it("sync lifecycle events expose canonical names and retained legacy aliases", () => {
    expect(SyncEvents.lifecycle.start.toEventName()).toBe(
      "sync:lifecycle:start",
    );
    expect(SyncEvents.lifecycle.start).toMatchObject({
      namespace: "sync",
      module: "lifecycle",
      action: "start",
    });
    expect(SyncEvents.lifecycle.trigger.toEventName()).toBe(
      "sync:lifecycle:trigger",
    );
    expect(SyncEvents.legacy.start.toEventName()).toBe("sync:start");
    expect(SyncEvents.legacy.stop.toEventName()).toBe("sync:stop");
    expect(SyncEvents.legacy.trigger.toEventName()).toBe("sync:trigger");
  });

  it("terminal session events expose canonical names and retained legacy aliases", () => {
    expect(TerminalEvents.session.create.toEventName()).toBe(
      "terminal:session:create",
    );
    expect(TerminalEvents.session.create).toMatchObject({
      namespace: "terminal",
      module: "session",
      action: "create",
    });
    expect(TerminalEvents.session.data.toEventName()).toBe(
      "terminal:session:data",
    );
    expect(TerminalEvents.legacy.create.toEventName()).toBe("terminal:create");
    expect(TerminalEvents.legacy.write.toEventName()).toBe("terminal:write");
    expect(TerminalEvents.legacy.kill.toEventName()).toBe("terminal:kill");
    expect(TerminalEvents.legacy.data.toEventName()).toBe("terminal:data");
    expect(TerminalEvents.legacy.exit.toEventName()).toBe("terminal:exit");
  });

  it("opener events expose canonical names and retained legacy aliases", () => {
    expect(OpenerEvents.plugin.open.toEventName()).toBe("plugin:opener:open");
    expect(OpenerEvents.install.request.toEventName()).toBe(
      "plugin:install:request",
    );
    expect(OpenerEvents.drop.install.toEventName()).toBe("plugin:drop:install");
    expect(OpenerEvents.app.resolve.toEventName()).toBe("opener:app:resolve");
    expect(OpenerEvents.app.resolve).toMatchObject({
      namespace: "opener",
      module: "app",
      action: "resolve",
    });
    expect(OpenerEvents.legacy.openPlugin.toEventName()).toBe("@open-plugin");
    expect(OpenerEvents.legacy.installPlugin.toEventName()).toBe(
      "@install-plugin",
    );
    expect(OpenerEvents.legacy.installDevPlugin.toEventName()).toBe(
      "plugin:install-dev",
    );
    expect(OpenerEvents.legacy.dropPlugin.toEventName()).toBe("drop:plugin");
    expect(OpenerEvents.legacy.resolveApp.toEventName()).toBe(
      "openers:resolve",
    );
  });

  it("auth and account events expose canonical names and retained legacy aliases", () => {
    expect(AuthEvents.session.getState.toEventName()).toBe(
      "auth:session:get-state",
    );
    expect(AuthEvents.session.getState).toMatchObject({
      namespace: "auth",
      module: "session",
      action: "get-state",
    });
    expect(AuthEvents.profile.update.toEventName()).toBe("auth:profile:update");
    expect(AuthEvents.device.getFingerprintHash.toEventName()).toBe(
      "auth:device:get-fingerprint-hash",
    );
    expect(AuthEvents.nexus.upload.toEventName()).toBe("auth:nexus:upload");
    expect(AuthEvents.stepUp.getToken.toEventName()).toBe(
      "auth:step-up:get-token",
    );
    expect(AuthEvents.legacy.getState.toEventName()).toBe("auth:get-state");
    expect(AuthEvents.legacy.nexusUpload.toEventName()).toBe(
      "auth:nexus-upload",
    );
    expect(AuthEvents.legacy.getFingerprintHash.toEventName()).toBe(
      "auth:get-fingerprint-hash",
    );

    expect(AccountEvents.auth.getToken.toEventName()).toBe(
      "account:auth:get-token",
    );
    expect(AccountEvents.sync.recordActivity.toEventName()).toBe(
      "account:sync:record-activity",
    );
    expect(AccountEvents.sync.recordActivity).toMatchObject({
      namespace: "account",
      module: "sync",
      action: "record-activity",
    });
    expect(AccountEvents.legacy.getAuthToken.toEventName()).toBe(
      "account:get-auth-token",
    );
    expect(AccountEvents.legacy.recordSyncActivity.toEventName()).toBe(
      "account:record-sync-activity",
    );
  });

  it("corebox retained events expose canonical names and retained legacy aliases", () => {
    expect(CoreBoxRetainedEvents.beginner.shortcutTriggered.toEventName()).toBe(
      "beginner:shortcut:triggered",
    );
    expect(CoreBoxEvents.beginner.shortcutTriggered.toEventName()).toBe(
      "beginner:shortcut:triggered",
    );
    expect(CoreBoxRetainedEvents.input.focus.toEventName()).toBe(
      "core-box:input:focus",
    );
    expect(CoreBoxEvents.input.focus.toEventName()).toBe(
      "core-box:input:focus",
    );
    expect(CoreBoxRetainedEvents.input.focus).toMatchObject({
      namespace: "core-box",
      module: "input",
      action: "focus",
    });
    expect(CoreBoxRetainedEvents.ui.resume.toEventName()).toBe(
      "core-box:ui:resume",
    );
    expect(CoreBoxEvents.ui.resume.toEventName()).toBe("core-box:ui:resume");
    expect(CoreBoxRetainedEvents.ui.show.toEventName()).toBe(
      "core-box:ui:show",
    );
    expect(CoreBoxRetainedEvents.ui.hide.toEventName()).toBe(
      "core-box:ui:hide",
    );
    expect(CoreBoxRetainedEvents.ui.expand.toEventName()).toBe(
      "core-box:ui:expand",
    );
    expect(CoreBoxRetainedEvents.ui.focusWindow.toEventName()).toBe(
      "core-box:ui:focus-window",
    );
    expect(CoreBoxRetainedEvents.ui.forwardKeyEvent.toEventName()).toBe(
      "core-box:ui:forward-key-event",
    );
    expect(CoreBoxRetainedEvents.ui.getUIViewState.toEventName()).toBe(
      "core-box:ui:get-ui-view-state",
    );
    expect(CoreBoxRetainedEvents.ui.shortcutTriggered.toEventName()).toBe(
      "core-box:ui:shortcut-triggered",
    );
    expect(CoreBoxRetainedEvents.ui.uiModeExited.toEventName()).toBe(
      "core-box:ui:mode-exited",
    );
    expect(CoreBoxRetainedEvents.ui.hideInput.toEventName()).toBe(
      "core-box:ui:hide-input",
    );
    expect(CoreBoxRetainedEvents.ui.showInput.toEventName()).toBe(
      "core-box:ui:show-input",
    );
    expect(CoreBoxRetainedEvents.ui.focusWindow).toMatchObject({
      namespace: "core-box",
      module: "ui",
      action: "focus-window",
    });
    expect(CoreBoxRetainedEvents.input.get.toEventName()).toBe(
      "core-box:input:get",
    );
    expect(CoreBoxRetainedEvents.input.set.toEventName()).toBe(
      "core-box:input:set",
    );
    expect(CoreBoxRetainedEvents.input.clear.toEventName()).toBe(
      "core-box:input:clear",
    );
    expect(CoreBoxRetainedEvents.input.setQuery.toEventName()).toBe(
      "core-box:input:set-query",
    );
    expect(CoreBoxRetainedEvents.input.setVisibility.toEventName()).toBe(
      "core-box:input:set-visibility",
    );
    expect(CoreBoxRetainedEvents.input.requestValue.toEventName()).toBe(
      "core-box:input:request-value",
    );
    expect(CoreBoxRetainedEvents.input.set).toMatchObject({
      namespace: "core-box",
      module: "input",
      action: "set",
    });
    expect(CoreBoxRetainedEvents.inputMonitoring.allow.toEventName()).toBe(
      "core-box:input-monitoring:allow",
    );
    expect(CoreBoxRetainedEvents.inputMonitoring.allow).toMatchObject({
      namespace: "core-box",
      module: "input-monitoring",
      action: "allow",
    });
    expect(CoreBoxRetainedEvents.clipboard.allow.toEventName()).toBe(
      "core-box:clipboard:allow",
    );
    expect(CoreBoxRetainedEvents.clipboard.allow).toMatchObject({
      namespace: "core-box",
      module: "clipboard",
      action: "allow",
    });
    expect(CoreBoxRetainedEvents.provider.deactivate.toEventName()).toBe(
      "core-box:provider:deactivate",
    );
    expect(CoreBoxRetainedEvents.provider.deactivateAll.toEventName()).toBe(
      "core-box:provider:deactivate-all",
    );
    expect(CoreBoxRetainedEvents.provider.getActivated.toEventName()).toBe(
      "core-box:provider:get-activated",
    );
    expect(CoreBoxRetainedEvents.provider.getDetails.toEventName()).toBe(
      "core-box:provider:get-details",
    );
    expect(CoreBoxRetainedEvents.provider.deactivate).toMatchObject({
      namespace: "core-box",
      module: "provider",
      action: "deactivate",
    });
    expect(CoreBoxRetainedEvents.layout.setHeight.toEventName()).toBe(
      "core-box:layout:set-height",
    );
    expect(CoreBoxRetainedEvents.layout.setPositionOffset.toEventName()).toBe(
      "core-box:layout:set-position-offset",
    );
    expect(CoreBoxRetainedEvents.layout.getBounds.toEventName()).toBe(
      "core-box:layout:get-bounds",
    );
    expect(CoreBoxRetainedEvents.layout.setHeight).toMatchObject({
      namespace: "core-box",
      module: "layout",
      action: "set-height",
    });
    expect(CoreBoxRetainedEvents.uiMode.enter.toEventName()).toBe(
      "core-box:ui-mode:enter",
    );
    expect(CoreBoxRetainedEvents.uiMode.exit.toEventName()).toBe(
      "core-box:ui-mode:exit",
    );
    expect(CoreBoxRetainedEvents.uiMode.enter).toMatchObject({
      namespace: "core-box",
      module: "ui-mode",
      action: "enter",
    });
    expect(CoreBoxRetainedEvents.recommendation.get.toEventName()).toBe(
      "core-box:recommendation:get",
    );
    expect(
      CoreBoxRetainedEvents.recommendation.aggregateTimeStats.toEventName(),
    ).toBe("core-box:recommendation:aggregate-time-stats");
    expect(CoreBoxRetainedEvents.recommendation.isPinned.toEventName()).toBe(
      "core-box:recommendation:is-pinned",
    );
    expect(CoreBoxEvents.recommendation.get.toEventName()).toBe(
      "core-box:recommendation:get",
    );
    expect(CoreBoxEvents.recommendation.aggregateTimeStats.toEventName()).toBe(
      "core-box:recommendation:aggregate-time-stats",
    );
    expect(CoreBoxEvents.recommendation.isPinned.toEventName()).toBe(
      "core-box:recommendation:is-pinned",
    );
    expect(CoreBoxRetainedEvents.previewHistory.show.toEventName()).toBe(
      "core-box:preview-history:show",
    );
    expect(CoreBoxEvents.previewHistory.show.toEventName()).toBe(
      "core-box:preview-history:show",
    );
    expect(CoreBoxEvents.previewHistory.hide.toEventName()).toBe(
      "core-box:preview-history:hide",
    );
    expect(CoreBoxRetainedEvents.preview.copy.toEventName()).toBe(
      "core-box:preview:copy",
    );
    expect(CoreBoxEvents.preview.copy.toEventName()).toBe(
      "core-box:preview:copy",
    );
    expect(CoreBoxRetainedEvents.actionPanel.open.toEventName()).toBe(
      "core-box:action-panel:open",
    );
    expect(CoreBoxEvents.actionPanel.open.toEventName()).toBe(
      "core-box:action-panel:open",
    );
    expect(CoreBoxRetainedEvents.metaOverlay.itemAction.toEventName()).toBe(
      "core-box:meta-overlay:item-action",
    );
    expect(CoreBoxEvents.metaOverlay.actionExecuted.toEventName()).toBe(
      "core-box:meta-overlay:action-executed",
    );
    expect(CoreBoxEvents.metaOverlay.itemAction.toEventName()).toBe(
      "core-box:meta-overlay:item-action",
    );
    expect(CoreBoxEvents.metaOverlay.flowTransfer.toEventName()).toBe(
      "core-box:meta-overlay:flow-transfer",
    );
    expect(
      CoreBoxRetainedEvents.legacy.beginnerShortcutTriggered.toEventName(),
    ).toBe("beginner:shortcut-triggered");
    expect(CoreBoxRetainedEvents.legacy.focusInput.toEventName()).toBe(
      "corebox:focus-input",
    );
    expect(CoreBoxRetainedEvents.legacy.getInput.toEventName()).toBe(
      "core-box:get-input",
    );
    expect(CoreBoxRetainedEvents.legacy.setInput.toEventName()).toBe(
      "core-box:set-input",
    );
    expect(CoreBoxRetainedEvents.legacy.clearInput.toEventName()).toBe(
      "core-box:clear-input",
    );
    expect(CoreBoxRetainedEvents.legacy.setQuery.toEventName()).toBe(
      "core-box:set-query",
    );
    expect(CoreBoxRetainedEvents.legacy.setInputVisibility.toEventName()).toBe(
      "core-box:set-input-visibility",
    );
    expect(CoreBoxRetainedEvents.legacy.requestInputValue.toEventName()).toBe(
      "core-box:request-input-value",
    );
    expect(CoreBoxRetainedEvents.legacy.openActionPanel.toEventName()).toBe(
      "corebox:open-action-panel",
    );
    expect(
      CoreBoxRetainedEvents.legacy.metaOverlayItemAction.toEventName(),
    ).toBe("meta-overlay:item-action");
    expect(CoreBoxRetainedEvents.legacy.show.toEventName()).toBe(
      "core-box:show",
    );
    expect(CoreBoxRetainedEvents.legacy.hide.toEventName()).toBe(
      "core-box:hide",
    );
    expect(CoreBoxRetainedEvents.legacy.expand.toEventName()).toBe(
      "core-box:expand",
    );
    expect(CoreBoxRetainedEvents.legacy.focusWindow.toEventName()).toBe(
      "core-box:focus-window",
    );
    expect(CoreBoxRetainedEvents.legacy.forwardKeyEvent.toEventName()).toBe(
      "core-box:forward-key-event",
    );
    expect(CoreBoxRetainedEvents.legacy.getUIViewState.toEventName()).toBe(
      "core-box:get-ui-view-state",
    );
    expect(CoreBoxRetainedEvents.legacy.shortcutTriggered.toEventName()).toBe(
      "core-box:shortcut-triggered",
    );
    expect(CoreBoxRetainedEvents.legacy.uiModeExited.toEventName()).toBe(
      "core-box:ui-mode-exited",
    );
    expect(CoreBoxRetainedEvents.legacy.hideInput.toEventName()).toBe(
      "core-box:hide-input",
    );
    expect(CoreBoxRetainedEvents.legacy.showInput.toEventName()).toBe(
      "core-box:show-input",
    );
    expect(CoreBoxRetainedEvents.legacy.setHeight.toEventName()).toBe(
      "core-box:set-height",
    );
    expect(CoreBoxRetainedEvents.legacy.setPositionOffset.toEventName()).toBe(
      "core-box:set-position-offset",
    );
    expect(CoreBoxRetainedEvents.legacy.getBounds.toEventName()).toBe(
      "core-box:get-bounds",
    );
    expect(CoreBoxRetainedEvents.legacy.enterUIMode.toEventName()).toBe(
      "core-box:enter-ui-mode",
    );
    expect(CoreBoxRetainedEvents.legacy.exitUIMode.toEventName()).toBe(
      "core-box:exit-ui-mode",
    );
    expect(CoreBoxRetainedEvents.legacy.allowInput.toEventName()).toBe(
      "core-box:allow-input",
    );
    expect(CoreBoxRetainedEvents.legacy.allowClipboard.toEventName()).toBe(
      "core-box:allow-clipboard",
    );
    expect(CoreBoxRetainedEvents.legacy.deactivateProvider.toEventName()).toBe(
      "core-box:deactivate-provider",
    );
    expect(CoreBoxRetainedEvents.legacy.deactivateProviders.toEventName()).toBe(
      "core-box:deactivate-providers",
    );
    expect(
      CoreBoxRetainedEvents.legacy.getActivatedProviders.toEventName(),
    ).toBe("core-box:get-activated-providers");
    expect(CoreBoxRetainedEvents.legacy.getProviderDetails.toEventName()).toBe(
      "core-box:get-provider-details",
    );
    expect(CoreBoxRetainedEvents.legacy.uiResume.toEventName()).toBe(
      "core-box:ui-resume",
    );
    expect(CoreBoxRetainedEvents.legacy.getRecommendations.toEventName()).toBe(
      "core-box:get-recommendations",
    );
    expect(CoreBoxRetainedEvents.legacy.aggregateTimeStats.toEventName()).toBe(
      "core-box:aggregate-time-stats",
    );
    expect(CoreBoxRetainedEvents.legacy.isPinned.toEventName()).toBe(
      "core-box:is-pinned",
    );
  });

  it("storage sdk maps app storage operations to typed storage events", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValueOnce({ theme: "dark" });
    const sdk = createStorageSdk(transport as any);
    const onData = vi.fn();

    await expect(sdk.app.get("app-setting.ini")).resolves.toEqual({
      theme: "dark",
    });
    await sdk.app.save({ key: "app-setting.ini", value: { theme: "light" } });
    await sdk.app.streamUpdated({ onData });

    expect(transport.send).toHaveBeenNthCalledWith(1, StorageEvents.app.get, {
      key: "app-setting.ini",
    });
    expect(transport.send).toHaveBeenNthCalledWith(2, StorageEvents.app.save, {
      key: "app-setting.ini",
      value: { theme: "light" },
    });
    expect(transport.stream).toHaveBeenCalledWith(
      StorageEvents.app.updated,
      undefined,
      { onData },
    );
  });

  it("clipboard metadata query event uses typed transport naming", () => {
    expect(ClipboardEvents.queryMeta.toEventName()).toBe(
      "clipboard:history:query-meta",
    );
    expect(ClipboardEvents.queryMeta).toMatchObject({
      namespace: "clipboard",
      module: "history",
      action: "query-meta",
    });
  });

  it("standalone screenshot sdk routes typed events and preserves native capture results", async () => {
    const transport = createTransportMock();
    const captureResult = {
      tfileUrl: "tfile:///tmp/native/shot.png",
      dataUrl: "data:image/png;base64,c2NyZWVuc2hvdA==",
      path: "/private/tmp/native/shot.png",
      mimeType: "image/png",
      width: 1280,
      height: 720,
      displayId: "display-1",
      displayName: "Primary Display",
      x: 0,
      y: 0,
      scaleFactor: 2,
      durationMs: 12,
      sizeBytes: 2048,
      wroteClipboard: false,
    };
    transport.send.mockResolvedValueOnce({
      supported: true,
      platform: "darwin",
      engine: "xcap",
    });
    transport.send.mockResolvedValueOnce([]);
    transport.send.mockResolvedValueOnce(captureResult);
    const sdk = createNativeScreenshotSdk(transport);

    await sdk.getSupport();
    await sdk.listDisplays();
    await expect(
      sdk.capture({
        target: "region",
        displayId: "display-1",
        region: { x: 10, y: 20, width: 300, height: 200 },
        output: "data-url",
      }),
    ).resolves.toEqual(captureResult);

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      NativeEvents.screenshot.getSupport,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      NativeEvents.screenshot.listDisplays,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      NativeEvents.screenshot.capture,
      {
        target: "region",
        displayId: "display-1",
        region: { x: 10, y: 20, width: 300, height: 200 },
        output: "data-url",
      },
    );
  });

  it("native events and sdk use typed transport naming", async () => {
    const transport = createTransportMock();
    const sdk = createNativeSdk(transport as any);

    expect(NativeEvents.capabilities.list.toEventName()).toBe(
      "native:capabilities:list",
    );
    expect(NativeEvents.capabilities.get.toEventName()).toBe(
      "native:capabilities:get",
    );
    expect(NativeEvents.screenshot.getSupport.toEventName()).toBe(
      "native:screenshot:get-support",
    );
    expect(NativeEvents.screenshot.listDisplays.toEventName()).toBe(
      "native:screenshot:list-displays",
    );
    expect(NativeEvents.screenshot.capture.toEventName()).toBe(
      "native:screenshot:capture",
    );
    expect(NativeEvents.screenshot.capture).toMatchObject({
      namespace: "native",
      module: "screenshot",
      action: "capture",
    });
    expect(NativeEvents.fileIndex.query.toEventName()).toBe(
      "native:file-index:query",
    );
    expect(NativeEvents.file.stat.toEventName()).toBe("native:file:stat");
    expect(NativeEvents.file.getThumbnail.toEventName()).toBe(
      "native:file:get-thumbnail",
    );
    expect(NativeEvents.media.probe.toEventName()).toBe("native:media:probe");

    await sdk.capabilities.list();
    await sdk.capabilities.get({ id: "file.stat" });
    await sdk.screenshot.getSupport();
    await sdk.screenshot.listDisplays();
    await sdk.screenshot.capture({
      target: "cursor-display",
      writeClipboard: true,
    });
    await sdk.fileIndex.query({ text: "hello", limit: 3 });
    await sdk.file.stat({ path: "/tmp/a.png" });
    await sdk.file.getThumbnail({ path: "/tmp/a.png" });
    await sdk.media.probe({ path: "/tmp/a.png" });
    await sdk.fileIndex.streamProgress({ onData: vi.fn() });

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      NativeEvents.capabilities.list,
      undefined,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      NativeEvents.capabilities.get,
      { id: "file.stat" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      NativeEvents.screenshot.getSupport,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      NativeEvents.screenshot.listDisplays,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      5,
      NativeEvents.screenshot.capture,
      {
        target: "cursor-display",
        writeClipboard: true,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      6,
      NativeEvents.fileIndex.query,
      { text: "hello", limit: 3 },
    );
    expect(transport.send).toHaveBeenNthCalledWith(7, NativeEvents.file.stat, {
      path: "/tmp/a.png",
    });
    expect(transport.send).toHaveBeenNthCalledWith(
      8,
      NativeEvents.file.getThumbnail,
      { path: "/tmp/a.png" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      9,
      NativeEvents.media.probe,
      { path: "/tmp/a.png" },
    );
    expect(transport.stream).toHaveBeenCalledWith(
      NativeEvents.fileIndex.progress,
      undefined,
      expect.objectContaining({ onData: expect.any(Function) }),
    );
  });

  it("quickops capability sdk maps to read-only typed transport event", async () => {
    const transport = createTransportMock();
    const sdk = createQuickOpsSdk(transport as any);

    expect(QuickOpsEvents.capabilities.get.toEventName()).toBe(
      "quick-ops:capabilities:get",
    );
    expect(TuffEvents.quickOps.capabilities.get).toBe(
      QuickOpsEvents.capabilities.get,
    );
    expect(QuickOpsEvents.sessions.get.toEventName()).toBe(
      "quick-ops:sessions:get",
    );
    expect(TuffEvents.quickOps.sessions.get).toBe(QuickOpsEvents.sessions.get);
    expect(QuickOpsEvents.audit.get.toEventName()).toBe("quick-ops:audit:get");
    expect(TuffEvents.quickOps.audit.get).toBe(QuickOpsEvents.audit.get);
    expect(QuickOpsEvents.systemInfo.get.toEventName()).toBe(
      "quick-ops:system-info:get",
    );
    expect(TuffEvents.quickOps.systemInfo.get).toBe(
      QuickOpsEvents.systemInfo.get,
    );
    expect(QuickOpsEvents.tuffDiagnostics.get.toEventName()).toBe(
      "quick-ops:tuff-diagnostics:get",
    );
    expect(TuffEvents.quickOps.tuffDiagnostics.get).toBe(
      QuickOpsEvents.tuffDiagnostics.get,
    );
    expect(QuickOpsEvents.diskSpace.get.toEventName()).toBe(
      "quick-ops:disk-space:get",
    );
    expect(TuffEvents.quickOps.diskSpace.get).toBe(
      QuickOpsEvents.diskSpace.get,
    );
    expect(QuickOpsEvents.directoryUsage.get.toEventName()).toBe(
      "quick-ops:directory-usage:get",
    );
    expect(TuffEvents.quickOps.directoryUsage.get).toBe(
      QuickOpsEvents.directoryUsage.get,
    );
    expect(QuickOpsEvents.queryLocalIp.get.toEventName()).toBe(
      "quick-ops:query-local-ip:get",
    );
    expect(TuffEvents.quickOps.queryLocalIp.get).toBe(
      QuickOpsEvents.queryLocalIp.get,
    );
    expect(QuickOpsEvents.portStatus.get.toEventName()).toBe(
      "quick-ops:port-status:get",
    );
    expect(TuffEvents.quickOps.portStatus.get).toBe(
      QuickOpsEvents.portStatus.get,
    );
    expect(QuickOpsEvents.dnsQuery.get.toEventName()).toBe(
      "quick-ops:dns-query:get",
    );
    expect(TuffEvents.quickOps.dnsQuery.get).toBe(QuickOpsEvents.dnsQuery.get);
    expect(QuickOpsEvents.fileHash.get.toEventName()).toBe(
      "quick-ops:file-hash:get",
    );
    expect(TuffEvents.quickOps.fileHash.get).toBe(QuickOpsEvents.fileHash.get);
    expect(QuickOpsEvents.fileBase64.get.toEventName()).toBe(
      "quick-ops:file-base64:get",
    );
    expect(TuffEvents.quickOps.fileBase64.get).toBe(
      QuickOpsEvents.fileBase64.get,
    );
    expect(QuickOpsEvents.recentDownload.get.toEventName()).toBe(
      "quick-ops:recent-download:get",
    );
    expect(TuffEvents.quickOps.recentDownload.get).toBe(
      QuickOpsEvents.recentDownload.get,
    );
    expect(QuickOpsEvents.commonDirectory.get.toEventName()).toBe(
      "quick-ops:common-directory:get",
    );
    expect(TuffEvents.quickOps.commonDirectory.get).toBe(
      QuickOpsEvents.commonDirectory.get,
    );
    expect(QuickOpsEvents.pathFormat.get.toEventName()).toBe(
      "quick-ops:path-format:get",
    );
    expect(TuffEvents.quickOps.pathFormat.get).toBe(
      QuickOpsEvents.pathFormat.get,
    );
    expect(QuickOpsEvents.formatText.get.toEventName()).toBe(
      "quick-ops:format-text:get",
    );
    expect(TuffEvents.quickOps.formatText.get).toBe(
      QuickOpsEvents.formatText.get,
    );
    expect(QuickOpsEvents.networkStatus.get.toEventName()).toBe(
      "quick-ops:network-status:get",
    );
    expect(TuffEvents.quickOps.networkStatus.get).toBe(
      QuickOpsEvents.networkStatus.get,
    );
    expect(QuickOpsEvents.batteryStatus.get.toEventName()).toBe(
      "quick-ops:battery-status:get",
    );
    expect(TuffEvents.quickOps.batteryStatus.get).toBe(
      QuickOpsEvents.batteryStatus.get,
    );
    expect(QuickOpsEvents.systemProxy.get.toEventName()).toBe(
      "quick-ops:system-proxy:get",
    );
    expect(TuffEvents.quickOps.systemProxy.get).toBe(
      QuickOpsEvents.systemProxy.get,
    );

    await sdk.capabilities();
    await sdk.sessions();
    await sdk.auditRecent();
    await sdk.auditRecent({ limit: 5 });
    await sdk.systemInfo();
    await sdk.tuffDiagnostics();
    await sdk.diskSpace();
    await sdk.directoryUsage({ deep: true });
    await sdk.queryLocalIp();
    await sdk.portStatus({ port: 5173 });
    await sdk.dnsQuery({ hostname: "example.com", deep: true });
    await sdk.fileHash({ path: "/tmp/demo.txt" });
    await sdk.fileBase64({ path: "/tmp/demo.txt" });
    await sdk.recentDownload();
    await sdk.commonDirectory({ query: "logs" });
    await sdk.pathFormat({ path: "/tmp/demo.txt" });
    await sdk.formatText({ text: "Hello QuickOps", mode: "snake" });
    await sdk.networkStatus();
    await sdk.batteryStatus();
    await sdk.systemProxy();

    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.capabilities.get,
    );
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.sessions.get);
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.audit.get, {});
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.audit.get, {
      limit: 5,
    });
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.systemInfo.get);
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.tuffDiagnostics.get,
    );
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.diskSpace.get);
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.directoryUsage.get,
      {
        deep: true,
      },
    );
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.queryLocalIp.get,
    );
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.portStatus.get, {
      port: 5173,
    });
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.dnsQuery.get, {
      hostname: "example.com",
      deep: true,
    });
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.fileHash.get, {
      path: "/tmp/demo.txt",
    });
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.fileBase64.get, {
      path: "/tmp/demo.txt",
    });
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.recentDownload.get,
    );
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.commonDirectory.get,
      {
        query: "logs",
      },
    );
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.pathFormat.get, {
      path: "/tmp/demo.txt",
    });
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.formatText.get, {
      text: "Hello QuickOps",
      mode: "snake",
    });
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.networkStatus.get,
    );
    expect(transport.send).toHaveBeenCalledWith(
      QuickOpsEvents.batteryStatus.get,
    );
    expect(transport.send).toHaveBeenCalledWith(QuickOpsEvents.systemProxy.get);
  });

  it("settings sdk maps device idle diagnostic event", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.deviceIdle.getDiagnostic();

    expect(transport.send).toHaveBeenCalledWith(
      AppEvents.deviceIdle.getDiagnostic,
    );
  });

  it("settings sdk maps managed app entry events through appIndex domain", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.appIndex.listEntries();
    await sdk.appIndex.upsertEntry({
      path: "/Applications/ChatApp.app",
      displayName: "聊天应用",
      enabled: true,
    });
    await sdk.appIndex.removeEntry({ path: "/Applications/ChatApp.app" });
    await sdk.appIndex.setEntryEnabled({
      path: "/Applications/ChatApp.app",
      enabled: false,
    });

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.appIndex.listEntries,
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.upsertEntry,
      {
        path: "/Applications/ChatApp.app",
        displayName: "聊天应用",
        enabled: true,
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AppEvents.appIndex.removeEntry,
      {
        path: "/Applications/ChatApp.app",
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      4,
      AppEvents.appIndex.setEntryEnabled,
      {
        path: "/Applications/ChatApp.app",
        enabled: false,
      },
    );
  });

  it("settings sdk maps app search diagnostic and reindex through appIndex domain", async () => {
    const transport = createTransportMock();
    const sdk = createSettingsSdk(transport as any);

    await sdk.appIndex.diagnose({
      target: "JSON Formatter",
      query: "json formatter",
    });
    await sdk.appIndex.reindex({
      target: "JSON Formatter",
      mode: "keywords",
    });

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AppEvents.appIndex.diagnose,
      {
        target: "JSON Formatter",
        query: "json formatter",
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AppEvents.appIndex.reindex,
      {
        target: "JSON Formatter",
        mode: "keywords",
      },
    );
  });

  it("app sdk maps openPromptsFolder to typed system event", async () => {
    const transport = createTransportMock();
    const sdk = createAppSdk(transport as any);

    await sdk.openPromptsFolder();

    expect(transport.send).toHaveBeenCalledWith(
      AppEvents.system.openPromptsFolder,
    );
  });

  it("intelligence sdk throws typed error when main returns failed ApiResponse", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValueOnce({
      ok: false,
      error: "quota exceeded",
    });

    const sdk = createIntelligenceSdk(transport as any);

    await expect(sdk.invoke("text.chat", { messages: [] })).rejects.toThrow(
      "quota exceeded",
    );
  });

  it("intelligence sdk maps core API calls through typed api events", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({ ok: true, result: null });
    const sdk = createIntelligenceSdk(transport as any);

    await sdk.invoke("text.chat", { messages: [] });
    await sdk.ttsSpeak({ text: "hello", language: "en" });
    await sdk.testProvider({
      id: "provider-1",
      type: "openai",
      name: "Provider 1",
      enabled: true,
      apiKey: "test",
    } as any);
    await sdk.getQuota({ callerId: "plugin.demo" });

    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:invoke",
    );
    expect(transport.send.mock.calls[0]?.[0]).toMatchObject({
      namespace: "intelligence",
      module: "api",
      action: "invoke",
    });
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:tts-speak",
    );
    expect(transport.send.mock.calls[1]?.[0]).toMatchObject({
      namespace: "intelligence",
      module: "api",
      action: "tts-speak",
    });
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:test-provider",
    );
    expect(transport.send.mock.calls[3]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:get-quota",
    );
  });

  it("intelligence sdk forwards explicit prompt fields through invoke and text.chat", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({ ok: true, result: null });
    const sdk = createIntelligenceSdk(transport);
    const options = {
      promptTemplate: "Use {{locale}} conventions",
      promptVariables: { locale: "de-DE" },
      metadata: { caller: "plugin.prompt-command" },
    };
    const invokePayload = {
      messages: [{ role: "user" as const, content: "Summarize" }],
    };
    const chatPayload = {
      messages: [{ role: "user" as const, content: "Translate" }],
    };

    await sdk.invoke("text.chat", invokePayload, options);
    await sdk.text.chat(chatPayload, options);

    expect(transport.send).toHaveBeenNthCalledWith(1, expect.anything(), {
      capabilityId: "text.chat",
      payload: invokePayload,
      options,
    });
    expect(transport.send).toHaveBeenNthCalledWith(2, expect.anything(), {
      capabilityId: "text.chat",
      payload: chatPayload,
      options,
    });
  });

  it("intelligence sdk maps nested capability wrappers through typed invoke events", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({ ok: true, result: null });
    const sdk = createIntelligenceSdk(transport);

    const cases = [
      {
        capabilityId: "text.chat",
        payload: { messages: [{ role: "user", content: "hello" }] },
        options: { metadata: { caller: "nested-text" } },
        invoke: () =>
          sdk.text.chat(
            { messages: [{ role: "user", content: "hello" }] },
            { metadata: { caller: "nested-text" } },
          ),
      },
      {
        capabilityId: "embedding.generate",
        payload: { text: "semantic query" },
        options: { metadata: { caller: "nested-embedding" } },
        invoke: () =>
          sdk.embedding.generate(
            { text: "semantic query" },
            { metadata: { caller: "nested-embedding" } },
          ),
      },
      {
        capabilityId: "code.review",
        payload: { code: "const answer = 42", language: "ts" },
        options: { metadata: { caller: "nested-code" } },
        invoke: () =>
          sdk.code.review(
            { code: "const answer = 42", language: "ts" },
            { metadata: { caller: "nested-code" } },
          ),
      },
      {
        capabilityId: "intent.detect",
        payload: { text: "book a meeting tomorrow" },
        options: { metadata: { caller: "nested-intent" } },
        invoke: () =>
          sdk.intent.detect(
            { text: "book a meeting tomorrow" },
            { metadata: { caller: "nested-intent" } },
          ),
      },
      {
        capabilityId: "vision.ocr",
        payload: {
          source: { type: "data-url", dataUrl: "data:image/png;base64,AAAA" },
        },
        options: { metadata: { caller: "nested-vision" } },
        invoke: () =>
          sdk.vision.ocr(
            {
              source: {
                type: "data-url",
                dataUrl: "data:image/png;base64,AAAA",
              },
            },
            { metadata: { caller: "nested-vision" } },
          ),
      },
      {
        capabilityId: "image.edit",
        payload: {
          source: { type: "data-url", dataUrl: "data:image/png;base64,source" },
          prompt: "Add a red scarf",
        },
        options: { metadata: { caller: "nested-image" } },
        invoke: () =>
          sdk.image.edit(
            {
              source: {
                type: "data-url",
                dataUrl: "data:image/png;base64,source",
              },
              prompt: "Add a red scarf",
            },
            { metadata: { caller: "nested-image" } },
          ),
      },
      {
        capabilityId: "audio.tts",
        payload: { text: "Hello", voice: "alloy", format: "mp3" },
        options: { metadata: { caller: "nested-audio-tts" } },
        invoke: () =>
          sdk.audio.tts(
            { text: "Hello", voice: "alloy", format: "mp3" },
            { metadata: { caller: "nested-audio-tts" } },
          ),
      },
      {
        capabilityId: "audio.stt",
        payload: { audio: "data:audio/wav;base64,AAAA", language: "en" },
        options: { metadata: { caller: "nested-audio-stt" } },
        invoke: () =>
          sdk.audio.stt(
            { audio: "data:audio/wav;base64,AAAA", language: "en" },
            { metadata: { caller: "nested-audio-stt" } },
          ),
      },
      {
        capabilityId: "audio.transcribe",
        payload: { audio: "data:audio/mpeg;base64,BBBB", language: "fr" },
        options: { metadata: { caller: "nested-audio-transcribe" } },
        invoke: () =>
          sdk.audio.transcribe(
            { audio: "data:audio/mpeg;base64,BBBB", language: "fr" },
            { metadata: { caller: "nested-audio-transcribe" } },
          ),
      },
      {
        capabilityId: "rag.query",
        payload: { query: "release notes" },
        options: { metadata: { caller: "nested-rag" } },
        invoke: () =>
          sdk.rag.query(
            { query: "release notes" },
            { metadata: { caller: "nested-rag" } },
          ),
      },
      {
        capabilityId: "workflow.execute",
        payload: { workflowId: "wf_1", inputs: { topic: "release" } },
        options: { metadata: { caller: "nested-workflow" } },
        invoke: () =>
          sdk.workflow.execute(
            { workflowId: "wf_1", inputs: { topic: "release" } },
            { metadata: { caller: "nested-workflow" } },
          ),
      },
      {
        capabilityId: "agent.run",
        payload: { task: "Summarize release readiness", context: "ticket:T-1" },
        options: { metadata: { caller: "nested-agent" } },
        invoke: () =>
          sdk.agent.run(
            { task: "Summarize release readiness", context: "ticket:T-1" },
            { metadata: { caller: "nested-agent" } },
          ),
      },
    ];

    for (const testCase of cases) {
      await testCase.invoke();
    }

    for (const [index, testCase] of cases.entries()) {
      expect(transport.send.mock.calls[index]?.[0]?.toEventName?.()).toBe(
        "intelligence:api:invoke",
      );
      expect(transport.send).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          namespace: "intelligence",
          module: "api",
          action: "invoke",
        }),
        {
          capabilityId: testCase.capabilityId,
          payload: testCase.payload,
          options: testCase.options,
        },
      );
    }
  });

  it("intelligence sdk maps read-only capability discovery through typed api events", async () => {
    const transport = createTransportMock();
    transport.send
      .mockResolvedValueOnce({
        ok: true,
        result: {
          capabilityId: "text.chat",
          available: false,
          providerIds: [],
          reason: "no-provider",
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: [
          {
            providerId: "local-llm",
            providerName: "Local LLM",
            providerType: "ollama",
            models: ["llama3.2"],
            defaultModel: null,
            capabilities: ["text.chat"],
            available: false,
          },
        ],
      });
    const sdk = createIntelligenceSdk(transport);

    await expect(
      sdk.getCapabilityStatus({ capabilityId: "text.chat" }),
    ).resolves.toEqual({
      capabilityId: "text.chat",
      available: false,
      providerIds: [],
      reason: "no-provider",
    });
    await expect(
      sdk.getProviderModelOptions({ capabilityId: "text.chat" }),
    ).resolves.toEqual([
      {
        providerId: "local-llm",
        providerName: "Local LLM",
        providerType: "ollama",
        models: ["llama3.2"],
        defaultModel: null,
        capabilities: ["text.chat"],
        available: false,
      },
    ]);

    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:get-capability-status",
    );
    expect(transport.send.mock.calls[0]?.[0]).toMatchObject({
      namespace: "intelligence",
      module: "api",
      action: "get-capability-status",
    });
    expect(transport.send).toHaveBeenNthCalledWith(1, expect.anything(), {
      capabilityId: "text.chat",
    });
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:get-provider-model-options",
    );
    expect(transport.send.mock.calls[1]?.[0]).toMatchObject({
      namespace: "intelligence",
      module: "api",
      action: "get-provider-model-options",
    });
    expect(transport.send).toHaveBeenNthCalledWith(2, expect.anything(), {
      capabilityId: "text.chat",
    });
  });

  it("intelligence sdk maps capability stream to typed transport stream and callbacks", async () => {
    const transport = createTransportMock();
    const sdk = createIntelligenceSdk(transport as any);
    const onStart = vi.fn();
    const onDelta = vi.fn();
    const onEnd = vi.fn();

    await sdk.stream(
      "text.chat",
      { messages: [{ role: "user", content: "hello" }] },
      { onStart, onDelta, onEnd },
      { metadata: { caller: "test" } },
    );

    expect(transport.stream).toHaveBeenCalledTimes(1);
    const [event, payload, options] = transport.stream.mock.calls[0] || [];
    expect(event?.toEventName?.()).toBe("intelligence:api:stream");
    expect(event).toMatchObject({
      namespace: "intelligence",
      module: "api",
      action: "stream",
    });
    expect(payload).toEqual({
      capabilityId: "text.chat",
      payload: { messages: [{ role: "user", content: "hello" }] },
      options: { metadata: { caller: "test" }, stream: true },
    });

    options.onData({
      type: "start",
      capabilityId: "text.chat",
      traceId: "trace_1",
    });
    options.onData({ type: "delta", capabilityId: "text.chat", delta: "he" });
    options.onData({ type: "end", capabilityId: "text.chat" });
    options.onEnd();
    expect(onStart).toHaveBeenCalledWith({
      type: "start",
      capabilityId: "text.chat",
      traceId: "trace_1",
    });
    expect(onDelta).toHaveBeenCalledWith("he", {
      type: "delta",
      capabilityId: "text.chat",
      delta: "he",
    });
    expect(onEnd).toHaveBeenCalledWith({
      type: "end",
      capabilityId: "text.chat",
    });
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("intelligence sdk maps local knowledge and context hygiene calls through typed events", async () => {
    const transport = createTransportMock();
    transport.send
      .mockResolvedValueOnce({
        ok: true,
        result: {
          status: "ok",
          contextText: "[1] Knowledge Notes\ncitation evidence",
          chunks: [],
          tokenEstimate: 0,
          citations: [],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          session: {
            id: "ctxs_1",
            owner: "corebox",
            status: "active",
            createdAt: 1,
            updatedAt: 1,
          },
          turn: {
            id: "ctxt_1",
            sessionId: "ctxs_1",
            role: "user",
            content: "Use local knowledge",
            privacyLevel: "normal",
            tokenEstimate: 5,
            createdAt: 1,
          },
          package: {
            id: "ctxpkg_1",
            sessionId: "ctxs_1",
            scope: "retrieval",
            tokenBudget: 120,
            tokenEstimate: 5,
            items: [
              {
                sourceType: "retrieval",
                sourceId: "chunk-1",
                reason: "local knowledge match: Knowledge Notes",
                content: "citation evidence",
                tokenEstimate: 4,
                metadata: {
                  citation: {
                    documentId: "doc-1",
                    chunkId: "chunk-1",
                    title: "Knowledge Notes",
                    sourceType: "manual",
                    updatedAt: 2,
                  },
                  status: "ok",
                },
              },
            ],
            metadata: {
              retrieval: {
                status: "ok",
                chunkCount: 1,
                citationCount: 1,
              },
            },
            createdAt: 1,
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          checkpoints: [
            {
              id: "ctxcp_1",
              sessionId: "ctxs_1",
              type: "session_start",
              reason: "new-session",
              contextScope: "retrieval",
              metadata: { source: "test" },
              createdAt: 1,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          logs: [
            {
              id: "ctxpkg_1",
              sessionId: "ctxs_1",
              scope: "retrieval",
              traceId: "trace-1",
              tokenBudget: 120,
              tokenEstimate: 5,
              items: [
                {
                  sourceType: "retrieval",
                  sourceId: "chunk-1",
                  reason: "local knowledge match: Knowledge Notes",
                  tokenEstimate: 4,
                  metadata: {
                    citation: {
                      documentId: "doc-1",
                      chunkId: "chunk-1",
                      title: "Knowledge Notes",
                    },
                  },
                },
              ],
              metadata: {
                retrieval: {
                  status: "ok",
                  chunkCount: 1,
                  citationCount: 1,
                },
              },
              createdAt: 1,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          memories: [
            {
              id: "mem_1",
              type: "preference",
              scope: "workspace",
              content: "Use Chinese replies by default",
              summary: "Use Chinese replies by default",
              tags: ["language"],
              confidence: 0.8,
              privacyLevel: "normal",
              enabled: true,
              createdAt: 1,
              updatedAt: 2,
              usageCount: 0,
            },
          ],
          offset: 0,
          limit: 10,
          hasMore: false,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          memoryId: "mem_1",
          enabled: false,
          updatedAt: 3,
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          status: "suggested",
          reason: "explicit_memory_candidate",
          fingerprint: "a".repeat(64),
          candidate: {
            type: "preference",
            scope: "workspace",
            summary: "Use Chinese replies by default",
            tags: ["language"],
            confidence: 0.8,
            privacyLevel: "normal",
          },
        },
      })
      .mockResolvedValueOnce({
        ok: true,
        result: {
          memory: {
            id: "mem_2",
            type: "preference",
            scope: "workspace",
            content: "Use concise Chinese replies",
            summary: "Use concise Chinese replies",
            tags: ["language"],
            confidence: 0.8,
            replacesMemoryId: "mem_1",
            privacyLevel: "normal",
            enabled: true,
            createdAt: 3,
            updatedAt: 3,
            usageCount: 0,
          },
          tombstone: {
            id: "memdel_1",
            memoryId: "mem_1",
            reason: "replaced-by:mem_2",
            createdAt: 3,
          },
        },
      });
    const sdk = createIntelligenceSdk(transport as any);

    const context = await sdk.knowledgeBuildContext({
      query: "local knowledge",
      tokenBudget: 120,
      maxChunks: 4,
      dedupe: true,
    });
    const prepared = await sdk.contextPrepareTurn({
      owner: "corebox",
      input: "Use local knowledge",
      explicitScope: "retrieval",
      tokenBudget: 120,
    });
    const checkpoints = await sdk.contextListCheckpoints({
      sessionId: "ctxs_1",
      type: "session_start",
      limit: 20,
    });
    const logs = await sdk.contextListPackageLogs({
      sessionId: "ctxs_1",
      traceId: "trace-1",
      limit: 20,
    });
    const memories = await sdk.contextListMemories({
      scope: "workspace",
      type: "preference",
      limit: 10,
    });
    const memoryState = await sdk.contextSetMemoryEnabled({
      memoryId: "mem_1",
      enabled: false,
    });
    const memory = await sdk.contextEvaluateMemory({
      content: "Use Chinese replies by default",
      type: "preference",
      scope: "workspace",
      tags: ["language"],
    });
    const replaced = await sdk.contextReplaceMemory({
      memoryId: "mem_1",
      expectedUpdatedAt: 2,
      evaluationFingerprint: "a".repeat(64),
      replacement: {
        type: "preference",
        scope: "workspace",
        content: "Use concise Chinese replies",
      },
    });

    expect(context.status).toBe("ok");
    expect(prepared.package.items[0]?.metadata).toMatchObject({
      citation: {
        documentId: "doc-1",
        chunkId: "chunk-1",
        title: "Knowledge Notes",
      },
      status: "ok",
    });
    expect(logs.logs[0]?.items[0]).toMatchObject({
      sourceType: "retrieval",
      sourceId: "chunk-1",
      metadata: {
        citation: {
          documentId: "doc-1",
          chunkId: "chunk-1",
        },
      },
    });
    expect(memories.memories[0]).toMatchObject({
      id: "mem_1",
      type: "preference",
      scope: "workspace",
      privacyLevel: "normal",
    });
    expect(memoryState).toMatchObject({
      memoryId: "mem_1",
      enabled: false,
    });
    expect(checkpoints.checkpoints[0]).toMatchObject({
      id: "ctxcp_1",
      sessionId: "ctxs_1",
      type: "session_start",
      reason: "new-session",
      contextScope: "retrieval",
    });
    expect(memory).toMatchObject({
      status: "suggested",
      candidate: {
        type: "preference",
        scope: "workspace",
        privacyLevel: "normal",
      },
    });
    expect(replaced.memory).toMatchObject({
      id: "mem_2",
      replacesMemoryId: "mem_1",
    });
    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:knowledge:build-context",
    );
    expect(transport.send.mock.calls[0]?.[1]).toEqual({
      query: "local knowledge",
      tokenBudget: 120,
      maxChunks: 4,
      dedupe: true,
    });
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:prepare-turn",
    );
    expect(transport.send.mock.calls[1]?.[1]).toEqual({
      owner: "corebox",
      input: "Use local knowledge",
      explicitScope: "retrieval",
      tokenBudget: 120,
    });
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:checkpoints:list",
    );
    expect(transport.send.mock.calls[2]?.[1]).toEqual({
      sessionId: "ctxs_1",
      type: "session_start",
      limit: 20,
    });
    expect(transport.send.mock.calls[3]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:package-logs:list",
    );
    expect(transport.send.mock.calls[3]?.[1]).toEqual({
      sessionId: "ctxs_1",
      traceId: "trace-1",
      limit: 20,
    });
    expect(transport.send.mock.calls[4]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:memory:list",
    );
    expect(transport.send.mock.calls[4]?.[1]).toEqual({
      scope: "workspace",
      type: "preference",
      limit: 10,
    });
    expect(transport.send.mock.calls[5]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:memory:set-enabled",
    );
    expect(transport.send.mock.calls[5]?.[1]).toEqual({
      memoryId: "mem_1",
      enabled: false,
    });
    expect(transport.send.mock.calls[6]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:memory:evaluate",
    );
    expect(transport.send.mock.calls[6]?.[1]).toEqual({
      content: "Use Chinese replies by default",
      type: "preference",
      scope: "workspace",
      tags: ["language"],
    });
    expect(transport.send.mock.calls[7]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:memory:replace",
    );
    expect(transport.send.mock.calls[7]?.[1]).toEqual({
      memoryId: "mem_1",
      expectedUpdatedAt: 2,
      evaluationFingerprint: "a".repeat(64),
      replacement: {
        type: "preference",
        scope: "workspace",
        content: "Use concise Chinese replies",
      },
    });
  });

  it("intelligence sdk maps compression snapshot lifecycle through typed events", async () => {
    const snapshot = {
      id: "snapshot-1",
      sessionId: "session-1",
      currentState: "Compression ready",
      decisions: ["Keep source turns"],
      constraints: [],
      artifacts: [],
      openQuestions: [],
      sourceTurnFrom: "turn-1",
      sourceTurnTo: "turn-2",
      metadata: { checkpointId: "checkpoint-1" },
      createdAt: 3,
    };
    const transport = createTransportMock();
    transport.send
      .mockResolvedValueOnce({
        ok: true,
        result: {
          status: "created",
          snapshot,
          checkpoint: {
            id: "checkpoint-1",
            sessionId: "session-1",
            type: "compression_snapshot",
            reason: "compression-snapshot-created",
            contextScope: "session",
            createdAt: 3,
          },
          sessionUpdatedAt: 101,
        },
      })
      .mockResolvedValueOnce({ ok: true, result: { snapshots: [snapshot] } })
      .mockResolvedValueOnce({ ok: true, result: snapshot });
    const sdk = createIntelligenceSdk(transport as any);
    const createPayload = {
      sessionId: "session-1",
      expectedSessionUpdatedAt: 100,
      snapshot: {
        currentState: "Compression ready",
        decisions: ["Keep source turns"],
        sourceTurnFrom: "turn-1",
        sourceTurnTo: "turn-2",
      },
    };

    const created = await sdk.contextCreateCompressionSnapshot(createPayload);
    const listed = await sdk.contextListCompressionSnapshots({
      sessionId: "session-1",
      limit: 5,
    });
    const latest = await sdk.contextGetLatestCompressionSnapshot({
      sessionId: "session-1",
    });

    expect(created).toMatchObject({ status: "created", sessionUpdatedAt: 101 });
    expect(listed.snapshots[0]).toMatchObject({ id: "snapshot-1" });
    expect(latest).toMatchObject({ id: "snapshot-1" });
    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:compression:create",
    );
    expect(transport.send.mock.calls[0]?.[1]).toEqual(createPayload);
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:compression:list",
    );
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      "intelligence:context:compression:latest",
    );
  });

  it("intelligence sdk stream throws when stream transport is unavailable", async () => {
    const transport = { send: vi.fn() };
    const sdk = createIntelligenceSdk(transport as any);

    await expect(
      sdk.stream("text.chat", { messages: [] }, { onDelta: vi.fn() }),
    ).rejects.toThrow("stream-capable transport");
  });

  it("intelligence sdk maps session subscribe to typed transport stream", async () => {
    const transport = createTransportMock();
    const sdk = createIntelligenceSdk(transport as any);
    const onData = vi.fn();

    await sdk.agentSessionSubscribe(
      { sessionId: "tis_1", fromSeq: 3 },
      { onData },
    );

    expect(transport.stream).toHaveBeenCalledTimes(1);
    const [event, payload, options] = transport.stream.mock.calls[0] || [];
    expect(event?.toEventName?.()).toBe("intelligence:agent:session:subscribe");
    expect(event).toMatchObject({
      namespace: "intelligence",
      module: "agent",
      action: "session:subscribe",
    });
    expect(payload).toEqual({ sessionId: "tis_1", fromSeq: 3 });
    expect(options).toEqual({ onData });
  });

  it("intelligence sdk maps agent tool approval through typed event builder", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({ ok: true, result: null });
    const sdk = createIntelligenceSdk(transport as any);

    await sdk.agentToolApprove({
      ticketId: "ticket_1",
      approved: true,
      reason: "reviewed",
    });

    const [event, payload] = transport.send.mock.calls[0] || [];
    expect(event?.toEventName?.()).toBe("intelligence:agent:tool:approve");
    expect(event).toMatchObject({
      namespace: "intelligence",
      module: "agent",
      action: "tool:approve",
    });
    expect(payload).toEqual({
      ticketId: "ticket_1",
      approved: true,
      reason: "reviewed",
    });
  });

  it("intelligence sdk subscribe throws when stream transport is unavailable", async () => {
    const transport = { send: vi.fn() };
    const sdk = createIntelligenceSdk(transport as any);

    await expect(
      sdk.agentSessionSubscribe({ sessionId: "tis_1" }, { onData: vi.fn() }),
    ).rejects.toThrow("transport.stream is unavailable");
  });

  it("intelligence sdk maps workflow CRUD events through typed transport events", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({ ok: true, result: undefined });
    const sdk = createIntelligenceSdk(transport as any);

    await sdk.workflowList({ includeTemplates: true });
    await sdk.workflowGet({ workflowId: "wf_1" });
    await sdk.workflowSave({
      id: "wf_1",
      name: "整理剪贴板",
      triggers: [],
      contextSources: [],
      toolSources: ["builtin"],
      steps: [],
    });
    await sdk.workflowDelete({ workflowId: "wf_1" });
    await sdk.workflowRun({ workflowId: "wf_1", sessionId: "tis_1" });
    await sdk.workflowHistory({ workflowId: "wf_1", limit: 10 });
    await sdk.workflowReviewUpdate({
      runId: "run_1",
      itemId: "run_1:step_1",
      status: "copied",
    });

    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:list",
    );
    expect(transport.send.mock.calls[0]?.[0]).toMatchObject({
      namespace: "intelligence",
      module: "workflow",
      action: "list",
    });
    expect(transport.send.mock.calls[0]?.[1]).toEqual({
      includeTemplates: true,
    });
    expect(transport.send.mock.calls[1]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:get",
    );
    expect(transport.send.mock.calls[1]?.[1]).toEqual({ workflowId: "wf_1" });
    expect(transport.send.mock.calls[2]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:save",
    );
    expect(transport.send.mock.calls[2]?.[1]).toEqual({
      id: "wf_1",
      name: "整理剪贴板",
      triggers: [],
      contextSources: [],
      toolSources: ["builtin"],
      steps: [],
    });
    expect(transport.send.mock.calls[3]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:delete",
    );
    expect(transport.send.mock.calls[3]?.[1]).toEqual({ workflowId: "wf_1" });
    expect(transport.send.mock.calls[4]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:run",
    );
    expect(transport.send.mock.calls[4]?.[1]).toEqual({
      workflowId: "wf_1",
      sessionId: "tis_1",
    });
    expect(transport.send.mock.calls[5]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:history",
    );
    expect(transport.send.mock.calls[5]?.[1]).toEqual({
      workflowId: "wf_1",
      limit: 10,
    });
    expect(transport.send.mock.calls[6]?.[0]?.toEventName?.()).toBe(
      "intelligence:workflow:review:update",
    );
    expect(transport.send.mock.calls[6]?.[0]).toMatchObject({
      namespace: "intelligence",
      module: "workflow",
      action: "review:update",
    });
    expect(transport.send.mock.calls[6]?.[1]).toEqual({
      runId: "run_1",
      itemId: "run_1:step_1",
      status: "copied",
    });
  });

  it("intelligence sdk maps local environment scan through typed transport events", async () => {
    const transport = createTransportMock();
    transport.send.mockResolvedValue({
      ok: true,
      result: {
        scannedAt: 1,
        cwd: "/repo",
        tools: [],
        configFiles: [],
        skillProviders: [],
      },
    });
    const sdk = createIntelligenceSdk(transport as any);

    const result = await sdk.getLocalEnvironment();

    expect(result.cwd).toBe("/repo");
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: "intelligence",
        module: "api",
        action: "local-environment",
      }),
    );
    expect(transport.send.mock.calls[0]?.[0]?.toEventName?.()).toBe(
      "intelligence:api:local-environment",
    );
  });

  it("permission sdk maps grant + push subscription", async () => {
    const transport = createTransportMock();
    const dispose = vi.fn();
    transport.on.mockReturnValue(dispose);

    const sdk = createPermissionSdk(transport as any);

    await sdk.grant({
      pluginId: "demo",
      permissionId: "intelligence.basic",
      grantedBy: "user",
    });
    const unsubscribe = sdk.onUpdated(() => {});
    unsubscribe();

    expect(transport.send).toHaveBeenCalledWith(PermissionEvents.api.grant, {
      pluginId: "demo",
      permissionId: "intelligence.basic",
      grantedBy: "user",
    });
    expect(transport.on).toHaveBeenCalledWith(
      PermissionEvents.push.updated,
      expect.any(Function),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("agent market sdk maps market event names through typed events", async () => {
    const transport = createTransportMock();
    const sdk = createAgentStoreSdk(transport as any);

    await sdk.searchAgents({ keyword: "workflow" });
    await sdk.installAgent("community.workflow-agent", "1.0.0");
    await sdk.checkUpdates();

    expect(transport.send).toHaveBeenNthCalledWith(
      1,
      AgentsEvents.store.search,
      { keyword: "workflow" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.store.install,
      { agentId: "community.workflow-agent", version: "1.0.0" },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AgentsEvents.store.checkUpdates,
    );
  });

  it("agents sdk maps api list/execute-immediate/update-priority events", async () => {
    const transport = createTransportMock();
    const sdk = createAgentsSdk(transport as any);

    await sdk.listAll();
    await sdk.executeImmediate({
      agentId: "builtin.search-agent",
      type: "execute",
      input: { query: "hello" },
    });
    await sdk.updatePriority("task-1", 9);

    expect(AgentsEvents.api.listAll.toEventName()).toBe("agents:api:list-all");
    expect(AgentsEvents.api.executeImmediate.toEventName()).toBe(
      "agents:api:execute-immediate",
    );
    expect(AgentsEvents.api.updatePriority.toEventName()).toBe(
      "agents:api:update-priority",
    );
    expect(transport.send).toHaveBeenNthCalledWith(1, AgentsEvents.api.listAll);
    expect(transport.send).toHaveBeenNthCalledWith(
      2,
      AgentsEvents.api.executeImmediate,
      {
        agentId: "builtin.search-agent",
        type: "execute",
        input: { query: "hello" },
      },
    );
    expect(transport.send).toHaveBeenNthCalledWith(
      3,
      AgentsEvents.api.updatePriority,
      {
        taskId: "task-1",
        priority: 9,
      },
    );
  });

  it("agents sdk maps task push subscriptions", async () => {
    const transport = createTransportMock();
    const dispose = vi.fn();
    transport.on.mockReturnValue(dispose);
    const sdk = createAgentsSdk(transport as any);

    const unsubscribe = sdk.onTaskStarted(() => {});
    unsubscribe();

    expect(AgentsEvents.push.taskStarted.toEventName()).toBe(
      "agents:push:task-started",
    );
    expect(transport.on).toHaveBeenCalledWith(
      AgentsEvents.push.taskStarted,
      expect.any(Function),
    );
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
