import type { ClipboardChangePayload } from "../transport/events/types/clipboard";
import type {
  PluginActivationIdentity,
  StreamContext,
} from "../transport/main";
import { TuffMainTransport } from "../transport/sdk/main-transport";
import { ClipboardEvents, TransportEvents } from "../transport/events";
import { describe, expect, it, vi } from "vitest";

const { ipcHandle, FakeMessageChannelMain, browserWindowMock } = vi.hoisted(
  () => {
    class FakeMessagePortMain {
      on = vi.fn();
      start = vi.fn();
      close = vi.fn();
      postMessage = vi.fn();
    }
    class FakeMessageChannelMain {
      port1 = new FakeMessagePortMain();
      port2 = new FakeMessagePortMain();
    }
    return {
      ipcHandle: vi.fn(),
      FakeMessageChannelMain,
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
  };
  const transport = new TuffMainTransport(channel as never, keyManager);
  return { transport, handlers, revoke: () => (current = undefined) };
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

    const confirm = handlers.get(
      `plugin:${TransportEvents.port.confirm.toEventName()}`,
    );
    await confirm?.({
      ...data,
      data: { channel: ClipboardEvents.change.toEventName(), portId },
    });

    let streamContext: StreamContext<ClipboardChangePayload> | undefined;
    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      streamContext = context;
    });
    const start = handlers.get(
      `plugin:${ClipboardEvents.change.toEventName()}:stream:start`,
    );
    await start?.({
      ...data,
      data: { streamId: "plugin-stream", __transportPortId: portId },
    });

    expect(streamContext?.plugin?.identity).toMatchObject({
      authority: "message-port",
      pluginName: "plugin-a",
      pluginInstanceId: "instance-a",
      activationGeneration: 4,
      senderId: 82,
      portId,
    });

    revoke();
    streamContext = undefined;
    await start?.({
      ...data,
      data: { streamId: "stale-plugin-stream", __transportPortId: portId },
    });
    expect(
      (streamContext as StreamContext<ClipboardChangePayload> | undefined)?.plugin
        ?.identity,
    ).toBeUndefined();

    expect(await handleUpgrade!(data)).toMatchObject({
      accepted: false,
      error: { code: "plugin_identity_required" },
    });
  });
});
