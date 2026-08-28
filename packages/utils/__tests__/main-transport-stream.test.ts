import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClipboardChangePayload } from "../transport/events/types/clipboard";
import type {
  PluginActivationIdentity,
  StreamContext,
} from "../transport/types";
import { ClipboardEvents } from "../transport/events";
import { TuffMainTransport } from "../transport/sdk/main-transport";
import {
  createServerStreamRuntime,
  type ServerStreamRuntimeConfig,
} from "../transport/sdk/stream/server-runtime";

const { ipcHandle, FakeMessageChannelMain, browserWindowMock } = vi.hoisted(
  () => {
    class FakeMessagePortMain {
      private closeHandlers = new Set<() => void>();

      on(eventName: string, handler: () => void): void {
        if (eventName === "close") {
          this.closeHandlers.add(handler);
        }
      }

      start(): void {}

      close(): void {
        this.closeHandlers.forEach((handler) => handler());
      }

      postMessage(): void {}
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
  ipcMain: {
    handle: ipcHandle,
  },
  MessageChannelMain: FakeMessageChannelMain,
  BrowserWindow: browserWindowMock,
}));

describe("TuffMainTransport.onStream", () => {
  function createChannel() {
    const handlers = new Map<string, (data: any) => void>();
    return {
      handlers,
      channel: {
        regChannel: vi.fn(
          (type: string, eventName: string, handler: (data: any) => void) => {
            handlers.set(`${type}:${eventName}`, handler);
            return () => {
              handlers.delete(`${type}:${eventName}`);
            };
          },
        ),
        sendTo: vi.fn(async () => undefined),
        sendPlugin: vi.fn(async () => undefined),
        broadcast: vi.fn(),
        broadcastTo: vi.fn(),
      },
    };
  }

  function createSender(id = 1) {
    let destroyed = false;
    const destroyedHandlers = new Set<() => void>();
    const sender = {
      id,
      send: vi.fn(),
      postMessage: vi.fn(),
      isDestroyed: vi.fn(() => destroyed),
      once: vi.fn((eventName: string, handler: () => void) => {
        if (eventName === "destroyed") {
          destroyedHandlers.add(handler);
        }
      }),
      removeListener: vi.fn((eventName: string, handler: () => void) => {
        if (eventName === "destroyed") {
          destroyedHandlers.delete(handler);
        }
      }),
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        for (const handler of destroyedHandlers) {
          handler();
        }
        destroyedHandlers.clear();
      },
    };
    return sender;
  }

  function createActivation(
    overrides: Partial<PluginActivationIdentity> = {},
  ): PluginActivationIdentity {
    return {
      name: "clipboard-history",
      pluginInstanceId: "clipboard-instance",
      activationGeneration: 1,
      key: "plugin-key",
      ...overrides,
    };
  }

  function createKeyManager(initial = createActivation()) {
    let current: PluginActivationIdentity | undefined = initial;
    let rotation = 0;
    const invalidationListeners = new Set<
      (identity: Readonly<PluginActivationIdentity>) => void
    >();
    const notifyInvalidated = (
      identity: Readonly<PluginActivationIdentity>,
    ) => {
      for (const listener of invalidationListeners) {
        listener(identity);
      }
    };
    const keyManager = {
      requestKey: vi.fn(
        (
          name: string,
          activation?: Pick<
            PluginActivationIdentity,
            "pluginInstanceId" | "activationGeneration"
          >,
        ) => {
          if (
            current?.name === name &&
            (!activation ||
              (current.pluginInstanceId === activation.pluginInstanceId &&
                current.activationGeneration ===
                  activation.activationGeneration))
          ) {
            return current.key;
          }

          const invalidated = current;
          current = {
            name,
            pluginInstanceId: activation?.pluginInstanceId ?? `legacy:${name}`,
            activationGeneration: activation?.activationGeneration ?? 1,
            key: `rotated-key-${++rotation}`,
          };
          if (invalidated) notifyInvalidated(invalidated);
          return current.key;
        },
      ),
      revokeKey: vi.fn((key: string) => {
        if (current?.key !== key) return false;
        const invalidated = current;
        current = undefined;
        notifyInvalidated(invalidated);
        return true;
      }),
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
          return () => {
            invalidationListeners.delete(listener);
          };
        },
      ),
    };

    return {
      keyManager,
      revoke: () => {
        if (current) keyManager.revokeKey(current.key);
      },
      current: () => current,
      identityListenerCount: () => invalidationListeners.size,
    };
  }

  function createPluginMessage(
    sender: ReturnType<typeof createSender>,
    streamId: string,
    activation = createActivation(),
  ) {
    return {
      data: { streamId },
      plugin: activation.name,
      header: { event: { sender }, uniqueKey: activation.key },
      pluginIdentity: activation,
    };
  }

  beforeEach(() => {
    ipcHandle.mockClear();
  });

  it("falls back to channel events when no stream port is available", () => {
    const { channel, handlers } = createChannel();
    const transport = new TuffMainTransport(channel as any, {} as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender();

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      context.emit({ latest: null, history: [] });
      context.end();
    });

    handlers.get(`main:${eventName}:stream:start`)?.({
      data: { streamId: "stream-main-1" },
      header: { event: { sender } },
    });

    expect(sender.send).toHaveBeenCalledTimes(2);
    expect(sender.send).toHaveBeenNthCalledWith(
      1,
      "@main-process-message",
      expect.objectContaining({
        data: { chunk: { latest: null, history: [] } },
        name: `${eventName}:stream:data:stream-main-1`,
      }),
    );
    expect(sender.send).toHaveBeenNthCalledWith(
      2,
      "@main-process-message",
      expect.objectContaining({
        data: {},
        name: `${eventName}:stream:end:stream-main-1`,
      }),
    );
  });

  it("stops emitting after cancel for plugin-originated streams", () => {
    const { channel, handlers } = createChannel();
    const transport = new TuffMainTransport(channel as any, {} as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(2);
    let capturedContext: StreamContext<ClipboardChangePayload> | null = null;

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      capturedContext = context;
    });

    handlers.get(`plugin:${eventName}:stream:start`)?.({
      data: { streamId: "stream-plugin-1" },
      plugin: "clipboard-history",
      header: { event: { sender }, uniqueKey: "plugin-key" },
    });

    handlers.get(`plugin:${eventName}:stream:cancel`)?.({
      data: { streamId: "stream-plugin-1" },
      header: { event: { sender } },
    });

    expect(capturedContext).not.toBeNull();
    capturedContext!.emit({ latest: null, history: [] });
    capturedContext!.end();

    expect(sender.send).not.toHaveBeenCalled();
  });

  it("aborts only the matching server stream signal", () => {
    const { channel, handlers } = createChannel();
    const testChannel = channel as unknown as ConstructorParameters<
      typeof TuffMainTransport
    >[0];
    const transport = new TuffMainTransport(testChannel, {} as never);
    const eventName = ClipboardEvents.change.toEventName();
    const firstSender = createSender(31);
    const secondSender = createSender(32);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    const start = handlers.get(`main:${eventName}:stream:start`);
    start?.({
      data: { streamId: "stream-main-a" },
      header: { event: { sender: firstSender } },
    });
    start?.({
      data: { streamId: "stream-main-b" },
      header: { event: { sender: secondSender } },
    });

    expect(contexts).toHaveLength(2);
    expect(contexts[0].signal.aborted).toBe(false);
    expect(contexts[1].signal.aborted).toBe(false);

    handlers.get(`main:${eventName}:stream:cancel`)?.({
      data: { streamId: "stream-main-a" },
      header: { event: { sender: firstSender } },
    });

    expect(contexts[0].signal.aborted).toBe(true);
    expect(contexts[1].signal.aborted).toBe(false);

    contexts[0].emit({ latest: null, history: [] });
    contexts[1].emit({ latest: null, history: [] });
    contexts[1].end();

    expect(firstSender.send).not.toHaveBeenCalled();
    expect(secondSender.send).toHaveBeenCalledTimes(2);
  });

  it("rejects a duplicate stream id from the same owner without replacing it", () => {
    const { channel, handlers } = createChannel();
    const transport = new TuffMainTransport(channel as any, {} as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(40);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    const start = handlers.get(`main:${eventName}:stream:start`)!;
    const request = {
      data: { streamId: "duplicate-stream" },
      header: { event: { sender } },
    };
    start(request);

    expect(() => start(request)).toThrow("Duplicate active stream identifier");
    expect(contexts).toHaveLength(1);
    expect(contexts[0].signal.aborted).toBe(false);

    handlers.get(`main:${eventName}:stream:cancel`)?.({
      ...request,
      data: { streamId: "duplicate-stream" },
    });
    expect(contexts[0].signal.aborted).toBe(true);
  });

  it("isolates the same stream id by authoritative sender object", () => {
    const { channel, handlers } = createChannel();
    const transport = new TuffMainTransport(channel as any, {} as any);
    const eventName = ClipboardEvents.change.toEventName();
    const firstSender = createSender(41);
    const foreignSenderWithSameId = createSender(41);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    const start = handlers.get(`main:${eventName}:stream:start`)!;
    start({
      data: { streamId: "shared-stream" },
      header: { event: { sender: firstSender } },
    });
    start({
      data: { streamId: "shared-stream" },
      header: { event: { sender: foreignSenderWithSameId } },
    });

    handlers.get(`main:${eventName}:stream:cancel`)?.({
      data: { streamId: "shared-stream", ownerKey: "forged-owner" },
      header: { event: { sender: firstSender } },
    });

    expect(contexts[0].signal.aborted).toBe(true);
    expect(contexts[1].signal.aborted).toBe(false);
    contexts[1].emit({ latest: null, history: [] });
    contexts[1].end();
    expect(firstSender.send).not.toHaveBeenCalled();
    expect(foreignSenderWithSameId.send).toHaveBeenCalledTimes(2);
  });

  it("separates MAIN and authoritative PLUGIN owners on the same sender", () => {
    const { channel, handlers } = createChannel();
    const activation = createActivation();
    const { keyManager } = createKeyManager(activation);
    const transport = new TuffMainTransport(channel as any, keyManager as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(42);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    handlers.get(`main:${eventName}:stream:start`)?.({
      data: { streamId: "cross-lane-stream" },
      header: { event: { sender } },
    });
    handlers.get(`plugin:${eventName}:stream:start`)?.(
      createPluginMessage(sender, "cross-lane-stream", activation),
    );

    expect(contexts).toHaveLength(2);
    expect(contexts[0].plugin).toBeUndefined();
    expect(contexts[1].plugin?.identity).toMatchObject({
      pluginName: activation.name,
      pluginInstanceId: activation.pluginInstanceId,
      activationGeneration: activation.activationGeneration,
    });

    handlers.get(`plugin:${eventName}:stream:cancel`)?.(
      createPluginMessage(sender, "cross-lane-stream", activation),
    );
    expect(contexts[0].signal.aborted).toBe(false);
    expect(contexts[1].signal.aborted).toBe(true);

    handlers.get(`main:${eventName}:stream:cancel`)?.({
      data: { streamId: "cross-lane-stream" },
      header: { event: { sender } },
    });
    expect(contexts[0].signal.aborted).toBe(true);
  });

  it("ignores foreign and unverified plugin cancellation", () => {
    const { channel, handlers } = createChannel();
    const activation = createActivation();
    const { keyManager } = createKeyManager(activation);
    const transport = new TuffMainTransport(channel as any, keyManager as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(43);
    const foreignSender = createSender(44);
    let context: StreamContext<ClipboardChangePayload> | undefined;

    transport.onStream(ClipboardEvents.change, (_payload, streamContext) => {
      context = streamContext;
    });

    handlers.get(`plugin:${eventName}:stream:start`)?.(
      createPluginMessage(sender, "protected-stream", activation),
    );

    handlers.get(`plugin:${eventName}:stream:cancel`)?.({
      data: { streamId: "protected-stream" },
      plugin: activation.name,
      header: { event: { sender }, uniqueKey: activation.key },
    });
    expect(context?.signal.aborted).toBe(false);

    handlers.get(`plugin:${eventName}:stream:cancel`)?.(
      createPluginMessage(foreignSender, "protected-stream", activation),
    );
    expect(context?.signal.aborted).toBe(false);

    context?.end();
  });

  it("aborts a revoked activation and isolates a same-generation reissue", () => {
    const { channel, handlers } = createChannel();
    const activation = createActivation();
    const { keyManager, revoke, current } = createKeyManager(activation);
    const transport = new TuffMainTransport(channel as any, keyManager as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(45);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    const start = handlers.get(`plugin:${eventName}:stream:start`)!;
    const cancel = handlers.get(`plugin:${eventName}:stream:cancel`)!;
    start(createPluginMessage(sender, "revoked-stream", activation));
    revoke();

    expect(contexts[0].signal.aborted).toBe(true);
    contexts[0].emit({ latest: null, history: [] });
    contexts[0].end();
    expect(sender.send).not.toHaveBeenCalled();

    keyManager.requestKey(activation.name, {
      pluginInstanceId: activation.pluginInstanceId,
      activationGeneration: activation.activationGeneration,
    });
    const reissued = current()!;
    expect(reissued.key).not.toBe(activation.key);
    start(createPluginMessage(sender, "revoked-stream", reissued));

    cancel(createPluginMessage(sender, "revoked-stream", activation));
    expect(contexts[1].signal.aborted).toBe(false);
    contexts[1].emit({ latest: null, history: [] });
    contexts[1].end();
    expect(sender.send).toHaveBeenCalledTimes(2);
  });

  it("releases and replaces sender owners across repeated activation rotations", () => {
    const { channel, handlers } = createChannel();
    const activation = createActivation();
    const { keyManager, current } = createKeyManager(activation);
    const transport = new TuffMainTransport(channel as any, keyManager as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(46);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    const start = handlers.get(`plugin:${eventName}:stream:start`)!;
    const mapSetSpy = vi.spyOn(Map.prototype, "set");
    const mapDeleteSpy = vi.spyOn(Map.prototype, "delete");
    const ownerKeys: object[] = [];
    const countMapCalls = (
      calls: readonly (readonly unknown[])[],
      key: string,
    ) => calls.filter(([candidate]) => candidate === key).length;

    const startCurrent = () => {
      const identity = current()!;
      const callsBeforeStart = mapSetSpy.mock.calls.length;
      start(createPluginMessage(sender, "rotated-stream", identity));
      const ownerKey = mapSetSpy.mock.calls
        .slice(callsBeforeStart)
        .find(
          ([candidate, value]) =>
            typeof candidate === "object" &&
            candidate !== null &&
            value instanceof Map,
        )?.[0];
      expect(ownerKey).toBeTypeOf("object");
      ownerKeys.push(ownerKey as object);
    };

    try {
      startCurrent();
      for (let generation = 2; generation <= 4; generation += 1) {
        const previous = current()!;
        keyManager.requestKey(activation.name, {
          pluginInstanceId: activation.pluginInstanceId,
          activationGeneration: generation,
        });

        expect(contexts.at(-1)?.signal.aborted).toBe(true);
        expect(countMapCalls(mapSetSpy.mock.calls, previous.key)).toBe(
          countMapCalls(mapDeleteSpy.mock.calls, previous.key),
        );
        startCurrent();
      }

      expect(new Set(ownerKeys).size).toBe(4);
      expect(contexts.at(-1)?.signal.aborted).toBe(false);

      const activeKey = current()!.key;
      sender.destroy();
      expect(countMapCalls(mapSetSpy.mock.calls, activeKey)).toBe(
        countMapCalls(mapDeleteSpy.mock.calls, activeKey),
      );
      expect(contexts.every((context) => context.signal.aborted)).toBe(true);

      for (const context of contexts) {
        context.emit({ latest: null, history: [] });
        context.end();
      }
      expect(sender.send).not.toHaveBeenCalled();
    } finally {
      mapSetSpy.mockRestore();
      mapDeleteSpy.mockRestore();
    }
  });

  it("aborts every active owner for a destroyed sender only", () => {
    const { channel, handlers } = createChannel();
    const activation = createActivation();
    const { keyManager } = createKeyManager(activation);
    const transport = new TuffMainTransport(channel as any, keyManager as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(47);
    const foreignSender = createSender(48);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];

    transport.onStream(ClipboardEvents.change, (_payload, context) => {
      contexts.push(context);
    });

    handlers.get(`main:${eventName}:stream:start`)?.({
      data: { streamId: "destroyed-main" },
      header: { event: { sender } },
    });
    handlers.get(`plugin:${eventName}:stream:start`)?.({
      data: { streamId: "destroyed-unverified" },
      plugin: "claimed-plugin",
      header: { event: { sender }, uniqueKey: "claimed-key" },
    });
    handlers.get(`plugin:${eventName}:stream:start`)?.(
      createPluginMessage(sender, "destroyed-plugin", activation),
    );
    handlers.get(`main:${eventName}:stream:start`)?.({
      data: { streamId: "foreign-main" },
      header: { event: { sender: foreignSender } },
    });

    expect(sender.once).toHaveBeenCalledTimes(1);
    sender.destroy();

    expect(contexts.slice(0, 3).every((context) => context.signal.aborted)).toBe(
      true,
    );
    expect(contexts[3].signal.aborted).toBe(false);
    for (const context of contexts.slice(0, 3)) {
      context.emit({ latest: null, history: [] });
      context.end();
    }
    expect(sender.send).not.toHaveBeenCalled();
    contexts[3].end();
    expect(foreignSender.send).toHaveBeenCalledTimes(1);
  });

  it("disposes active state and listeners when the handler unregisters", () => {
    const { channel, handlers } = createChannel();
    const { keyManager, identityListenerCount } = createKeyManager();
    const transport = new TuffMainTransport(channel as any, keyManager as any);
    const eventName = ClipboardEvents.change.toEventName();
    const sender = createSender(49);
    const contexts: StreamContext<ClipboardChangePayload>[] = [];
    const unregister = transport.onStream(
      ClipboardEvents.change,
      (_payload, context) => {
        contexts.push(context);
      },
    );
    const staleStart = handlers.get(`main:${eventName}:stream:start`)!;

    staleStart({
      data: { streamId: "unregistered-stream" },
      header: { event: { sender } },
    });
    expect(identityListenerCount()).toBe(1);
    unregister();

    expect(contexts[0].signal.aborted).toBe(true);
    expect(identityListenerCount()).toBe(0);
    expect(sender.removeListener).toHaveBeenCalledWith(
      "destroyed",
      expect.any(Function),
    );
    contexts[0].emit({ latest: null, history: [] });
    contexts[0].end();
    expect(sender.send).not.toHaveBeenCalled();

    expect(() =>
      staleStart({
        data: { streamId: "stale-start" },
        header: { event: { sender } },
      }),
    ).not.toThrow();
    expect(contexts).toHaveLength(1);
    unregister();
  });
});

describe("createServerStreamRuntime terminal failures", () => {
  type DirectConfig = ServerStreamRuntimeConfig<
    void,
    string,
    Record<string, never>
  >;

  function createRuntime(
    handler: DirectConfig["handler"],
    overrides: Partial<
      Pick<
        DirectConfig,
        "onHandlerError" | "portEnabled" | "resolvePort" | "sendFallback"
      >
    > = {},
  ) {
    const sendFallback = overrides.sendFallback ?? vi.fn();
    const ownerKey = {};
    const runtime = createServerStreamRuntime<
      void,
      string,
      Record<string, never>
    >({
      eventName: "test:stream",
      handler,
      buildContext: (_request, base) => base,
      sendFallback,
      ...overrides,
    });

    return { runtime, sendFallback, ownerKey };
  }

  function codedFailure(): Error {
    return Object.assign(new Error("permission denied"), {
      code: "INTELLIGENCE_PERMISSION_DENIED",
    });
  }

  it("converts a synchronous handler throw even when diagnostics also throw", () => {
    const failure = codedFailure();
    const onHandlerError = vi.fn(() => {
      throw new Error("diagnostic hook failed");
    });
    const { runtime, sendFallback, ownerKey } = createRuntime(
      () => {
        throw failure;
      },
      { onHandlerError },
    );

    expect(() =>
      runtime.handleStart({
        streamId: "sync-failure",
        ownerKey,
        payload: undefined,
        sender: {},
      }),
    ).not.toThrow();
    expect(onHandlerError).toHaveBeenCalledWith(failure);
    expect(sendFallback).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: "sync-failure" }),
      "test:stream:stream:error:sync-failure",
      {
        error: "permission denied",
        code: "INTELLIGENCE_PERMISSION_DENIED",
      },
    );
  });

  it("converts an asynchronous handler rejection", async () => {
    const failure = codedFailure();
    const { runtime, sendFallback, ownerKey } = createRuntime(async () => {
      throw failure;
    });

    runtime.handleStart({
      streamId: "async-failure",
      ownerKey,
      payload: undefined,
      sender: {},
    });

    await vi.waitFor(() => {
      expect(sendFallback).toHaveBeenCalledWith(
        expect.objectContaining({ streamId: "async-failure" }),
        "test:stream:stream:error:async-failure",
        {
          error: "permission denied",
          code: "INTELLIGENCE_PERMISSION_DENIED",
        },
      );
    });
  });

  it("falls back when the MessagePort send throws", () => {
    const portSend = vi.fn(() => {
      throw new Error("port send failed");
    });
    const { runtime, sendFallback, ownerKey } = createRuntime(
      (_payload, context) => {
        context.error(codedFailure());
      },
      {
        portEnabled: true,
        resolvePort: () => ({ portId: "port-1", send: portSend }),
      },
    );

    runtime.handleStart({
      streamId: "port-failure",
      ownerKey,
      portId: "port-1",
      payload: undefined,
      sender: {},
    });

    expect(portSend).toHaveBeenCalledTimes(1);
    expect(sendFallback).toHaveBeenCalledWith(
      expect.objectContaining({ streamId: "port-failure" }),
      "test:stream:stream:error:port-failure",
      {
        error: "permission denied",
        code: "INTELLIGENCE_PERMISSION_DENIED",
      },
    );
  });

  it("isolates same-id MessagePort streams by owner provenance", () => {
    const firstOwner = {};
    const secondOwner = {};
    const firstPortSend = vi.fn(() => true);
    const secondPortSend = vi.fn(() => true);
    const sendFallback = vi.fn();
    const contexts: StreamContext<string>[] = [];
    const runtime = createServerStreamRuntime<
      void,
      string,
      Record<string, never>
    >({
      eventName: "test:stream",
      portEnabled: true,
      handler: (_payload, context) => {
        contexts.push(context);
      },
      buildContext: (_request, base) => base,
      resolvePort: (request) =>
        request.ownerKey === firstOwner
          ? { portId: "port-a", send: firstPortSend }
          : { portId: "port-b", send: secondPortSend },
      sendFallback,
    });

    runtime.handleStart({
      streamId: "shared-port-stream",
      ownerKey: firstOwner,
      payload: undefined,
      sender: {},
    });
    runtime.handleStart({
      streamId: "shared-port-stream",
      ownerKey: secondOwner,
      payload: undefined,
      sender: {},
    });
    runtime.handleCancel({
      streamId: "shared-port-stream",
      ownerKey: firstOwner,
    });

    contexts[0].emit("ignored");
    contexts[0].end();
    contexts[1].emit("delivered");
    contexts[1].end();

    expect(firstPortSend).not.toHaveBeenCalled();
    expect(secondPortSend).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        portId: "port-b",
        streamId: "shared-port-stream",
        type: "data",
      }),
    );
    expect(secondPortSend).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        portId: "port-b",
        streamId: "shared-port-stream",
        type: "close",
      }),
    );
    expect(sendFallback).not.toHaveBeenCalled();
  });

  it("cancels only the targeted owner and silences its stale callbacks", () => {
    const firstOwner = {};
    const secondOwner = {};
    const contexts: StreamContext<string>[] = [];
    const { runtime, sendFallback } = createRuntime((_payload, context) => {
      contexts.push(context);
    });

    runtime.handleStart({
      streamId: "shared-owner-stream",
      ownerKey: firstOwner,
      payload: undefined,
      sender: {},
    });
    runtime.handleStart({
      streamId: "shared-owner-stream",
      ownerKey: secondOwner,
      payload: undefined,
      sender: {},
    });

    runtime.cancelOwner(firstOwner);
    expect(contexts[0].signal.aborted).toBe(true);
    expect(contexts[1].signal.aborted).toBe(false);

    contexts[0].emit("stale");
    contexts[0].error(new Error("stale"));
    contexts[0].end();
    contexts[1].emit("current");
    contexts[1].end();

    expect(sendFallback).toHaveBeenCalledTimes(2);
    expect(sendFallback).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ ownerKey: secondOwner }),
      "test:stream:stream:data:shared-owner-stream",
      { chunk: "current" },
    );
  });

  it("reuses an id after cancel without letting stale cleanup remove the replacement", () => {
    const contexts: StreamContext<string>[] = [];
    const { runtime, ownerKey } = createRuntime((_payload, context) => {
      contexts.push(context);
    });

    runtime.handleStart({
      streamId: "reused-stream",
      ownerKey,
      payload: undefined,
      sender: {},
    });
    runtime.handleCancel({ streamId: "reused-stream", ownerKey });
    runtime.handleStart({
      streamId: "reused-stream",
      ownerKey,
      payload: undefined,
      sender: {},
    });

    contexts[0].end();
    runtime.handleCancel({ streamId: "reused-stream", ownerKey });

    expect(contexts).toHaveLength(2);
    expect(contexts[0].signal.aborted).toBe(true);
    expect(contexts[1].signal.aborted).toBe(true);
  });

  it("cancels all current owners without disposing the runtime", () => {
    const contexts: StreamContext<string>[] = [];
    const { runtime, sendFallback } = createRuntime((_payload, context) => {
      contexts.push(context);
    });

    runtime.handleStart({
      streamId: "cancel-all-a",
      ownerKey: {},
      payload: undefined,
      sender: {},
    });
    runtime.handleStart({
      streamId: "cancel-all-b",
      ownerKey: {},
      payload: undefined,
      sender: {},
    });
    runtime.cancelAll();

    expect(contexts.slice(0, 2).every((context) => context.signal.aborted)).toBe(
      true,
    );

    runtime.handleStart({
      streamId: "after-cancel-all",
      ownerKey: {},
      payload: undefined,
      sender: {},
    });
    expect(contexts[2].signal.aborted).toBe(false);
    contexts[2].end();
    expect(sendFallback).toHaveBeenCalledOnce();
  });

  it("disposes every owner and ignores stale starts and callbacks", () => {
    const contexts: StreamContext<string>[] = [];
    const { runtime, sendFallback } = createRuntime((_payload, context) => {
      contexts.push(context);
    });

    runtime.handleStart({
      streamId: "dispose-a",
      ownerKey: {},
      payload: undefined,
      sender: {},
    });
    runtime.handleStart({
      streamId: "dispose-b",
      ownerKey: {},
      payload: undefined,
      sender: {},
    });
    runtime.dispose();
    runtime.dispose();

    expect(contexts.every((context) => context.signal.aborted)).toBe(true);
    for (const context of contexts) {
      context.emit("stale");
      context.error(new Error("stale"));
      context.end();
    }
    runtime.handleStart({
      streamId: "after-dispose",
      ownerKey: {},
      payload: undefined,
      sender: {},
    });

    expect(contexts).toHaveLength(2);
    expect(sendFallback).not.toHaveBeenCalled();
  });

  it.each([
    ["error", (context: StreamContext<string>) => context.error(codedFailure())],
    ["end", (context: StreamContext<string>) => context.end()],
  ])("cleans the active %s state when fallback delivery throws", (_label, terminate) => {
    let context: StreamContext<string> | undefined;
    const sendFallback = vi.fn(() => {
      throw new Error("fallback send failed");
    });
    const { runtime, ownerKey } = createRuntime(
      (_payload, streamContext) => {
        context = streamContext;
      },
      { sendFallback },
    );
    const deleteSpy = vi.spyOn(Map.prototype, "delete");

    try {
      runtime.handleStart({
        streamId: `fallback-${_label}`,
        ownerKey,
        payload: undefined,
        sender: {},
      });
      const callsBeforeTerminal = deleteSpy.mock.calls.length;

      expect(() => terminate(context!)).toThrow("fallback send failed");
      expect(
        deleteSpy.mock.calls
          .slice(callsBeforeTerminal)
          .some(([streamId]) => streamId === `fallback-${_label}`),
      ).toBe(true);
    } finally {
      deleteSpy.mockRestore();
    }
  });
});
