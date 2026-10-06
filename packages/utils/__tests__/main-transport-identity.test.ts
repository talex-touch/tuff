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
import { PluginEvents } from "../transport/events";
import { TerminalEvents } from "../transport/events/terminal";
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

/**
 * A real plugin-facing event, not a synthetic one.
 *
 * The plugin channel is default-deny since #688, so a `test:*` name is no longer bound to it
 * — and a test asserting how a plugin-channel handler resolves identity has to use an event
 * a plugin can actually reach, or it is asserting about a path that cannot happen.
 */
function identityEvent(suffix: string) {
  const source =
    suffix === "channel" ? PluginEvents.storage.getStats : PluginEvents.storage.getTree;
  return defineRawEvent<unknown, HandlerContext>(source.toEventName());
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

describe("TuffMainTransport owner notifications", () => {
  it("delivers to the bound sender only and rejects copied, foreign, rotated and revoked plugin identities", async () => {
    const current = activation();
    const { transport, handlers, channel, keyManager } = createHarness(current);
    const event = identityEvent("channel");
    const dispose = transport.on(event, (_payload, context) => context);
    const owner = { id: 91, isDestroyed: () => false } as HandlerContext["sender"];
    const foreign = { id: 91, isDestroyed: () => false } as HandlerContext["sender"];
    const other = activation({ name: "plugin-b", pluginInstanceId: "instance-b", key: "other-key" });
    const otherOwner = { id: 93, isDestroyed: () => false } as HandlerContext["sender"];
    const active = new Map<string, PluginActivationIdentity>([[current.name, current], [other.name, other]]);
    const recipients = new Map<HandlerContext["sender"], PluginActivationIdentity>([[owner, current], [otherOwner, other]]);
    keyManager.resolveIdentity.mockImplementation(key => [...active.values()].find(identity => identity.key === key));
    keyManager.resolveCurrentIdentity.mockImplementation(name => active.get(name));
    keyManager.resolveSenderIdentity.mockImplementation((sender: HandlerContext["sender"]) => recipients.get(sender));
    try {
      const handle = handlers.get(`plugin:${event.toEventName()}`);
      if (!handle) throw new Error("Missing plugin identity handler");
      const context = await handle({
        data: {}, plugin: current.name, pluginIdentity: { ...current },
        header: { event: { sender: owner }, uniqueKey: current.key },
      }) as HandlerContext;
      const otherContext = await handle({
        data: {}, plugin: other.name, pluginIdentity: { ...other },
        header: { event: { sender: otherOwner }, uniqueKey: other.key },
      }) as HandlerContext;
      const output = { id: "terminal-private", data: "secret output" };
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, context.plugin)).toBe(true);
      expect(channel.broadcastTo).toHaveBeenCalledWith(
        { webContents: owner }, "plugin", TerminalEvents.session.data.toEventName(), output, current,
      );
      expect(transport.notifyTo(foreign, TerminalEvents.session.data, output, context.plugin)).toBe(false);
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, {
        ...context.plugin!, identity: { ...context.plugin!.identity! },
      })).toBe(false);
      current.activationGeneration += 1;
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, context.plugin)).toBe(false);
      current.activationGeneration -= 1;
      current.pluginInstanceId = "replacement-instance";
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, context.plugin)).toBe(false);
      current.pluginInstanceId = "instance-a";
      current.key = "rotated-key";
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, context.plugin)).toBe(false);
      current.key = "current-key";
      recipients.delete(owner);
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, context.plugin)).toBe(false);
      recipients.set(owner, current);
      active.delete(current.name);
      expect(transport.notifyTo(owner, TerminalEvents.session.data, output, context.plugin)).toBe(false);
      const otherOutput = { id: "other-terminal", data: "other process output" };
      expect(transport.notifyTo(otherOwner, TerminalEvents.session.data, otherOutput, otherContext.plugin)).toBe(true);
      expect(channel.broadcastTo).toHaveBeenCalledWith(
        { webContents: otherOwner }, "plugin", TerminalEvents.session.data.toEventName(), otherOutput, other,
      );
      expect(channel.broadcastTo).toHaveBeenCalledTimes(2);
      expect(channel.broadcastPlugin).not.toHaveBeenCalled();
      expect(channel.sendTo).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  });

  it("drops host notifications after sender destruction and refuses the host lane for a plugin recipient", () => {
    const { transport, channel, keyManager } = createHarness();
    let destroyed = false;
    const owner = { id: 92, isDestroyed: () => destroyed } as HandlerContext["sender"];
    const exit = { id: "terminal-private", exitCode: 0 };
    expect(transport.notifyTo(owner, TerminalEvents.session.exit, exit)).toBe(true);
    expect(channel.broadcastTo).toHaveBeenCalledWith(
      { webContents: owner }, "main", TerminalEvents.session.exit.toEventName(), exit, undefined,
    );
    destroyed = true;
    expect(transport.notifyTo(owner, TerminalEvents.session.exit, exit)).toBe(false);
    destroyed = false;
    keyManager.resolveSenderIdentity.mockReturnValue(activation());
    expect(transport.notifyTo(owner, TerminalEvents.session.exit, exit)).toBe(false);
    expect(channel.broadcastTo).toHaveBeenCalledTimes(1);
  });
});
