import type {
  HandlerContext,
  PluginActivationIdentity,
} from "../transport/main";
import {
  createTrustedTestPluginContext,
  isAuthoritativePluginContext,
} from "../transport/security/plugin-identity";
import { TuffMainTransport } from "../transport/sdk/main-transport";
import { defineRawEvent } from "../transport/event/builder";
import { describe, expect, it, vi } from "vitest";

const { ipcHandle, browserWindowMock } = vi.hoisted(() => ({
  ipcHandle: vi.fn(),
  browserWindowMock: {
    getFocusedWindow: vi.fn(() => null),
    getAllWindows: vi.fn(() => []),
  },
}));

vi.mock("electron", () => ({
  ipcMain: { handle: ipcHandle },
  MessageChannelMain: class {},
  BrowserWindow: browserWindowMock,
}));

function identityEvent(suffix: string) {
  return defineRawEvent<unknown, HandlerContext>(
    `test:caller-identity:${suffix}`,
  );
}

function activation(
  overrides: Partial<PluginActivationIdentity> = {},
): PluginActivationIdentity {
  return {
    name: "plugin-a",
    pluginInstanceId: "instance-a",
    activationGeneration: 3,
    key: "current-key",
    ...overrides,
  };
}

function createHarness(current = activation()) {
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
  const keyManager = {
    requestKey: vi.fn(),
    revokeKey: vi.fn(),
    resolveKey: vi.fn((key: string) =>
      key === current.key ? current.name : undefined,
    ),
    isValidKey: vi.fn((key: string) => key === current.key),
    resolveIdentity: vi.fn((key: string) =>
      key === current.key ? current : undefined,
    ),
    resolveCurrentIdentity: vi.fn((name: string) =>
      name === current.name ? current : undefined,
    ),
    resolveSenderIdentity: vi.fn(),
  };
  return {
    channel,
    handlers,
    keyManager,
    transport: new TuffMainTransport(channel as never, keyManager),
  };
}

describe("TuffMainTransport caller identity", () => {
  it("issues an authoritative context only from a host-resolved channel candidate", async () => {
    const event = identityEvent("channel");
    const { transport, handlers } = createHarness();
    const observed: HandlerContext[] = [];
    transport.on(event, (_payload, context) => {
      observed.push(context);
      return context;
    });

    const sender = { id: 41 };
    await handlers.get(`plugin:${event.toEventName()}`)?.({
      data: {},
      plugin: "plugin-a",
      header: { event: { sender }, uniqueKey: "current-key" },
      pluginIdentity: activation(),
    });
    await handlers.get(`plugin:${event.toEventName()}`)?.({
      data: {},
      plugin: "plugin-a",
      header: { event: { sender }, uniqueKey: "forged-key" },
    });

    expect(isAuthoritativePluginContext(observed[0].plugin)).toBe(true);
    expect(observed[0].plugin?.identity).toMatchObject({
      authority: "web-contents",
      pluginName: "plugin-a",
      pluginInstanceId: "instance-a",
      activationGeneration: 3,
      senderId: 41,
    });
    expect(isAuthoritativePluginContext(observed[1].plugin)).toBe(false);
  });

  it("resolves ipcMain.handle callers from the real sender", async () => {
    const event = identityEvent("invoke");
    const { transport, keyManager } = createHarness();
    keyManager.resolveSenderIdentity.mockReturnValue(activation());
    const observed: HandlerContext[] = [];
    transport.on(event, (_payload, context) => {
      observed.push(context);
      return context;
    });

    const invokeHandler = ipcHandle.mock.calls.find(
      ([eventName]) => eventName === event.toEventName(),
    )?.[1];
    expect(invokeHandler).toBeTypeOf("function");
    await invokeHandler({ sender: { id: 52 } }, {});

    expect(keyManager.resolveSenderIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: 52 }),
    );
    expect(isAuthoritativePluginContext(observed[0].plugin)).toBe(true);
    expect(observed[0].plugin?.identity).toMatchObject({
      authority: "web-contents",
      senderId: 52,
    });
  });

  it("looks up local plugin identity instead of trusting caller fields", async () => {
    const event = identityEvent("local");
    const { transport } = createHarness();
    transport.on(event, (_payload, context) => context);
    const sender = { id: 63 } as HandlerContext["sender"];

    const current = await transport.invoke(
      event,
      {},
      {
        sender,
        plugin: { name: "plugin-a", uniqueKey: "current-key", verified: false },
      },
    );
    const forged = await transport.invoke(
      event,
      {},
      {
        sender,
        plugin: { name: "plugin-a", uniqueKey: "forged-key", verified: true },
      },
    );

    expect(isAuthoritativePluginContext(current.plugin)).toBe(true);
    expect(current.plugin?.identity?.authority).toBe("local-host");
    expect(isAuthoritativePluginContext(forged.plugin)).toBe(false);
  });

  it("rejects trusted test issuance outside test runtime", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousVitest = process.env.VITEST;
    process.env.NODE_ENV = "production";
    delete process.env.VITEST;
    try {
      expect(() =>
        createTrustedTestPluginContext({ name: "production-forgery" }),
      ).toThrow("only available in test runtime");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousVitest === undefined) {
        delete process.env.VITEST;
      } else {
        process.env.VITEST = previousVitest;
      }
    }
  });

  it("brands explicit test contexts and rejects structural copies", () => {
    const trusted = createTrustedTestPluginContext({
      name: "plugin-test",
      pluginInstanceId: "test-instance",
      activationGeneration: 1,
    });
    const copied = {
      ...trusted,
      identity: trusted.identity ? { ...trusted.identity } : undefined,
    };

    expect(isAuthoritativePluginContext(trusted)).toBe(true);
    expect(trusted.identity?.authority).toBe("test");
    expect(isAuthoritativePluginContext(copied)).toBe(false);
  });
});
