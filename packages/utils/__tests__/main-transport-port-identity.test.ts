import type { ClipboardChangePayload } from "../transport/events/types/clipboard";
import type {
  PluginActivationIdentity,
  StreamContext,
} from "../transport/main";
import { TuffMainTransport } from "../transport/sdk/main-transport";
import { ClipboardEvents, StorageEvents, TransportEvents } from "../transport/events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ipcHandle,
  FakeMessageChannelMain,
  browserWindowMock,
  messageChannels,
} = vi.hoisted(
  () => {
    const messageChannels: FakeMessageChannelMain[] = [];
    class FakeMessagePortMain {
      on = vi.fn();
      start = vi.fn();
      close = vi.fn();
      postMessage = vi.fn();
    }
    class FakeMessageChannelMain {
      port1 = new FakeMessagePortMain();
      port2 = new FakeMessagePortMain();

      constructor() {
        messageChannels.push(this);
      }
    }
    return {
      ipcHandle: vi.fn(),
      FakeMessageChannelMain,
      messageChannels,
      browserWindowMock: {
        getFocusedWindow: vi.fn(() => null),
        getAllWindows: vi.fn(() => []),
      },
    };
  },
);

vi.mock("electron", () => ({
  ipcMain: { handle: ipcHandle },
  MessageChannelMain: FakeMessageChannelMain,
  BrowserWindow: browserWindowMock,
}));

function activation(): PluginActivationIdentity {
  return {
    name: "plugin-a",
    pluginInstanceId: "instance-a",
    activationGeneration: 4,
    key: "current-key",
  };
}

function createHarness() {
  const handlers = new Map<string, (data: any) => unknown>();
  const channel = {
    regChannel: vi.fn(
      (type: string, eventName: string, handler: (data: any) => unknown) => {
        handlers.set(`${type}:${eventName}`, handler);
        return () => handlers.delete(`${type}:${eventName}`);
      },
    ),
    sendTo: vi.fn(),
    sendPlugin: vi.fn(),
    broadcast: vi.fn(),
    broadcastTo: vi.fn(),
    broadcastPlugin: vi.fn(),
  };
  let current: PluginActivationIdentity | undefined = activation();
  const invalidationListeners = new Set<
    (identity: Readonly<PluginActivationIdentity>) => void
  >();
  const keyManager = {
    requestKey: vi.fn(),
    revokeKey: vi.fn(),
    resolveKey: vi.fn(),
    isValidKey: vi.fn(),
    resolveIdentity: vi.fn((key: string) =>
      current?.key === key ? current : undefined,
    ),
    resolveCurrentIdentity: vi.fn(() => current),
    resolveSenderIdentity: vi.fn(),
    watchIdentityInvalidated: vi.fn(
      (listener: (identity: Readonly<PluginActivationIdentity>) => void) => {
        invalidationListeners.add(listener);
        return () => invalidationListeners.delete(listener);
      },
    ),
  };
  const transport = new TuffMainTransport(channel as never, keyManager);
  return {
    transport,
    handlers,
    reset: () => (current = activation()),
    revoke: () => {
      const invalidated = current;
      current = undefined;
      if (invalidated) {
        for (const listener of [...invalidationListeners]) {
          listener(invalidated);
        }
      }
    },
  };
}

function sender(id: number) {
  return {
    id,
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
    postMessage: vi.fn(),
    once: vi.fn(),
  };
}

function upgradePayload(pluginSender: ReturnType<typeof sender>) {
  return {
    data: {
      channel: ClipboardEvents.change.toEventName(),
      scope: "plugin",
      plugin: "plugin-a",
    },
    plugin: "plugin-a",
    header: { event: { sender: pluginSender }, uniqueKey: "current-key" },
    pluginIdentity: activation(),
  };
}

describe("TuffMainTransport plugin port identity", () => {
  const harness = createHarness();

  beforeEach(() => {
    harness.reset();
    messageChannels.length = 0;
  });

  it("rejects plugin-scoped upgrade without authoritative sender identity", async () => {
    const { handlers } = harness;
    const eventName = TransportEvents.port.upgrade.toEventName();
    const handleUpgrade = handlers.get(`plugin:${eventName}`);
    expect(handleUpgrade).toBeTypeOf("function");

    const result = await handleUpgrade?.({
      ...upgradePayload(sender(81)),
      pluginIdentity: undefined,
    });

    expect(result).toMatchObject({
      accepted: false,
      error: { code: "plugin_identity_required" },
    });
  });

  it("binds stream context to the confirmed port and rejects identity after revocation", async () => {
    const { handlers, transport, revoke } = harness;
    const handleUpgrade = handlers.get(
      `plugin:${TransportEvents.port.upgrade.toEventName()}`,
    );
    const data = upgradePayload(sender(82));

    const upgrade = await handleUpgrade!(data);
    expect(upgrade).toMatchObject({ accepted: true, scope: "plugin" });
    const portId = (upgrade as { portId?: string }).portId;
    expect(portId).toBeTypeOf("string");
    const serverPort = messageChannels.at(-1)?.port2;
    expect(serverPort).toBeDefined();

    const confirm = handlers.get(
      `plugin:${TransportEvents.port.confirm.toEventName()}`,
    );
    await confirm?.({
      ...data,
      data: { channel: ClipboardEvents.change.toEventName(), portId },
    });

    const streamContexts: StreamContext<ClipboardChangePayload>[] = [];
    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      streamContexts.push(context);
    });
    const start = handlers.get(
      `plugin:${ClipboardEvents.change.toEventName()}:stream:start`,
    );
    await start?.({
      ...data,
      data: { streamId: "plugin-stream", __transportPortId: portId },
    });

    expect(streamContexts[0]?.plugin?.identity).toMatchObject({
      authority: "message-port",
      pluginName: "plugin-a",
      pluginInstanceId: "instance-a",
      activationGeneration: 4,
      senderId: 82,
      portId,
    });

    await start?.({
      ...data,
      pluginIdentity: undefined,
      data: { streamId: "plugin-stream", __transportPortId: portId },
    });
    expect(streamContexts[1]?.plugin?.identity).toBeUndefined();
    streamContexts[1]?.emit({ latest: null, history: [] });
    expect(data.header.event.sender.send).toHaveBeenCalledOnce();

    const cancel = handlers.get(
      `plugin:${ClipboardEvents.change.toEventName()}:stream:cancel`,
    );
    await cancel?.({
      ...data,
      pluginIdentity: undefined,
      data: { streamId: "plugin-stream", __transportPortId: portId },
    });
    expect(streamContexts[0]?.signal.aborted).toBe(false);
    expect(streamContexts[1]?.signal.aborted).toBe(true);

    revoke();
    expect(serverPort?.close).toHaveBeenCalledOnce();
    expect(streamContexts[0]?.signal.aborted).toBe(true);
    await start?.({
      ...data,
      data: { streamId: "stale-plugin-stream", __transportPortId: portId },
    });
    expect(streamContexts[2]?.plugin?.identity).toBeUndefined();

    expect(await handleUpgrade!(data)).toMatchObject({
      accepted: false,
      error: { code: "plugin_identity_required" },
    });
    streamContexts[0]?.end();
    streamContexts[2]?.end();
  });

  it("binds port confirmation, use, and close to the exact sender object", async () => {
    const { handlers, transport } = harness;
    const firstSender = sender(83);
    const sameIdForeignSender = sender(83);
    const firstData = upgradePayload(firstSender);
    const foreignData = upgradePayload(sameIdForeignSender);
    const handleUpgrade = handlers.get(
      `plugin:${TransportEvents.port.upgrade.toEventName()}`,
    );
    const upgrade = await handleUpgrade!(firstData);
    const portId = (upgrade as { portId?: string }).portId;
    expect(portId).toBeTypeOf("string");

    const confirm = handlers.get(
      `plugin:${TransportEvents.port.confirm.toEventName()}`,
    );
    await confirm?.({
      ...foreignData,
      data: { channel: ClipboardEvents.change.toEventName(), portId },
    });

    const contexts: StreamContext<ClipboardChangePayload>[] = [];
    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });
    const start = handlers.get(
      `plugin:${ClipboardEvents.change.toEventName()}:stream:start`,
    );
    await start?.({
      ...firstData,
      data: { streamId: "unconfirmed-port", __transportPortId: portId },
    });
    expect(contexts[0]?.plugin?.identity?.authority).toBe("web-contents");
    contexts[0]?.end();
    expect(firstSender.send).toHaveBeenCalledOnce();

    await confirm?.({
      ...firstData,
      data: { channel: ClipboardEvents.change.toEventName(), portId },
    });
    const close = handlers.get(
      `plugin:${TransportEvents.port.close.toEventName()}`,
    );
    expect(close).toBeTypeOf("function");
    await close?.({
      ...foreignData,
      data: { portId, reason: "closed" },
    });

    await start?.({
      ...firstData,
      data: { streamId: "shared-sender-id", __transportPortId: portId },
    });
    await start?.({
      ...foreignData,
      data: { streamId: "shared-sender-id", __transportPortId: portId },
    });

    expect(contexts[1]?.plugin?.identity).toMatchObject({
      authority: "message-port",
      portId,
    });
    expect(contexts[2]?.plugin?.identity?.authority).toBe("web-contents");
    contexts[2]?.emit({ latest: null, history: [] });
    expect(sameIdForeignSender.send).toHaveBeenCalledOnce();
    expect(contexts[1]?.signal.aborted).toBe(false);
    contexts[1]?.end();
    contexts[2]?.end();
  });

  it("forces plugin scope, enforces channel allowlists, strips client permissions, and caps ports per sender", async () => {
    const { handlers } = harness;
    const handleUpgrade = handlers.get(
      `plugin:${TransportEvents.port.upgrade.toEventName()}`,
    )!;
    const spoofSender = sender(84);

    // Unverified plugin trying to spoof window scope must still require plugin identity
    const spoofedUnverified = await handleUpgrade({
      data: {
        channel: ClipboardEvents.change.toEventName(),
        scope: "window",
        permissions: ["system.shell"],
      },
      plugin: "__unverified_plugin_caller__",
      header: { event: { sender: spoofSender }, uniqueKey: "" },
      pluginIdentity: undefined,
    });
    expect(spoofedUnverified).toMatchObject({
      accepted: false,
      scope: "plugin",
      error: { code: "plugin_identity_required" },
    });

    // Verified plugin requesting window scope gets forced to plugin scope and client permissions stripped
    const spoofedVerified = await handleUpgrade({
      ...upgradePayload(spoofSender),
      data: {
        channel: ClipboardEvents.change.toEventName(),
        scope: "window",
        permissions: ["system.shell"],
      },
    });
    expect(spoofedVerified).toMatchObject({
      accepted: true,
      scope: "plugin",
    });
    expect((spoofedVerified as { permissions?: unknown }).permissions).toBeUndefined();
    expect(spoofSender.postMessage).toHaveBeenCalledWith(
      TransportEvents.port.confirm.toEventName(),
      expect.not.objectContaining({ permissions: expect.anything() }),
      expect.any(Array),
    );

    // Non-port-enabled / non-plugin-facing channel rejected
    const disallowedChannel = await handleUpgrade({
      ...upgradePayload(spoofSender),
      data: {
        channel: StorageEvents.app.get.toEventName(),
        scope: "plugin",
        plugin: "plugin-a",
      },
    });
    expect(disallowedChannel).toMatchObject({
      accepted: false,
      error: { code: "channel_not_allowed" },
    });

    // Per-sender port limit enforced (32 total; 1 already created for spoofSender)
    for (let i = 1; i < 32; i += 1) {
      const ok = await handleUpgrade(upgradePayload(spoofSender));
      expect(ok).toMatchObject({ accepted: true });
    }
    const overLimit = await handleUpgrade(upgradePayload(spoofSender));
    expect(overLimit).toMatchObject({
      accepted: false,
      error: { code: "port_limit_exceeded" },
    });
  });

  it("rejects plugin senders calling non-plugin-facing events over ipcMain.handle", async () => {
    const { transport } = harness;
    const handler = vi.fn(() => "host-secret");
    const dispose = transport.on(StorageEvents.app.get, handler);
    try {
      const invokeCall = ipcHandle.mock.calls.find(
        ([eventName]) => eventName === StorageEvents.app.get.toEventName(),
      );
      expect(invokeCall).toBeDefined();
      const invokeHandler = invokeCall![1];
      const pluginSender = sender(95);
      const keyManager = transport.keyManager;
      (keyManager.resolveSenderIdentity as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        activation(),
      );

      await expect(
        invokeHandler({ sender: pluginSender, senderFrame: null }, {}),
      ).rejects.toThrow("not available to plugin senders");
      expect(handler).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });
});
