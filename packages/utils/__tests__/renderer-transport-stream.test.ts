import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipboardEvents, TransportEvents } from "../transport/events";
import { TuffRendererTransport } from "../transport/sdk/renderer-transport";
import { installTransportPortHandoff } from "../transport/port-handoff";
import {
  createNativePortPair,
  createPortHandoffHarness,
} from "./transport/port-handoff-harness";

let currentChannel: {
  send: (eventName: string, payload?: unknown) => Promise<unknown>;
  regChannel: (
    eventName: string,
    handler: (raw: unknown) => void,
  ) => () => void;
};
let currentHandlers: Map<string, (raw: unknown) => void>;

vi.mock("../renderer/hooks/use-channel", () => ({
  useChannel: () => currentChannel,
}));

describe("TuffRendererTransport.stream", () => {
  const portChannelsEnv = "TALEX_TRANSPORT_PORT_CHANNELS";
  let originalWindow: PropertyDescriptor | undefined;
  let originalPortChannels: string | undefined;
  let sent: Array<{ eventName: string; payload: unknown }>;
  let onSend: ((eventName: string, payload: unknown) => unknown) | undefined;
  let testCleanups: Array<() => void>;

  beforeEach(() => {
    originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    originalPortChannels = process.env[portChannelsEnv];
    process.env[portChannelsEnv] = ClipboardEvents.change.toEventName();
    currentHandlers = new Map();
    sent = [];
    onSend = undefined;
    testCleanups = [];
    currentChannel = {
      async send(eventName, payload) {
        sent.push({ eventName, payload });
        return await onSend?.(eventName, payload);
      },
      regChannel(eventName, handler) {
        currentHandlers.set(eventName, handler);
        return () => {
          currentHandlers.delete(eventName);
        };
      },
    };
  });

  afterEach(() => {
    testCleanups.splice(0).forEach(cleanup => cleanup());
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as { window?: Window }).window;
    }
    if (originalPortChannels === undefined) {
      delete process.env[portChannelsEnv];
    } else {
      process.env[portChannelsEnv] = originalPortChannels;
    }
  });

  it("receives session and snapshot once through the preloaded port handoff and acknowledges confirmation", async () => {
    const harness = createPortHandoffHarness();
    const pair = createNativePortPair();
    const transport = new TuffRendererTransport();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: harness.targetWindow,
      writable: true,
    });
    testCleanups.push(() => pair.sender.close(), harness.dispose, () => transport.destroy());
    const disposeHandoff = installTransportPortHandoff(
      harness.ipcRenderer,
      harness.targetWindow,
    );

    testCleanups.push(disposeHandoff);
    const eventName = ClipboardEvents.change.toEventName();
    const portId = "renderer-port-1";
    const chunks: unknown[] = [];
    let endCount = 0;
    let streamId = "";
    let resolveTerminal!: () => void;
    const terminal = new Promise<void>(resolve => {
      resolveTerminal = resolve;
    });
    onSend = sentEventName => {
      if (sentEventName === TransportEvents.port.upgrade.toEventName()) {
        harness.emit(
          TransportEvents.port.confirm.toEventName(),
          { channel: eventName, portId, scope: "window" },
          [pair.receiver],
        );
        return { accepted: true, channel: eventName, portId };
      }
      return undefined;
    };

    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => {
        chunks.push(chunk);
        currentHandlers.get(`${eventName}:stream:data:${streamId}`)?.({
          header: { status: "request" },
          data: { chunk: { source: "channel-duplicate" } },
        });
      },
      onEnd: () => {
        endCount += 1;
        resolveTerminal();
      },
    });
    streamId = controller.streamId;

    pair.sender.postMessage({
      channel: eventName,
      portId,
      streamId,
      type: "data",
      payload: { chunk: { phase: "session" } },
    });
    pair.sender.postMessage({
      channel: eventName,
      portId,
      streamId,
      type: "data",
      payload: { chunk: { phase: "snapshot" } },
    });
    pair.sender.postMessage({ channel: eventName, portId, streamId, type: "end" });

    await terminal;
    expect(chunks).toEqual([{ phase: "session" }, { phase: "snapshot" }]);
    expect(endCount).toBe(1);
    expect(sent).toContainEqual({
      eventName: TransportEvents.port.confirm.toEventName(),
      payload: { channel: eventName, portId, scope: "window" },
    });
    expect(sent).toContainEqual({
      eventName: `${eventName}:stream:start`,
      payload: { streamId, __transportPortId: portId },
    });
  });

  it("falls back to channel terminal delivery when confirmation is unavailable", async () => {
    const harness = createPortHandoffHarness();
    const disposeHandoff = installTransportPortHandoff(
      harness.ipcRenderer,
      harness.targetWindow,
    );
    const transport = new TuffRendererTransport();
    testCleanups.push(disposeHandoff);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: harness.targetWindow,
      writable: true,
    });
    testCleanups.push(harness.dispose, () => transport.destroy());

    const eventName = ClipboardEvents.change.toEventName();
    onSend = sentEventName => {
      if (sentEventName === TransportEvents.port.upgrade.toEventName()) {
        return { accepted: true, channel: eventName, portId: "missing-renderer-port" };
      }
      return undefined;
    };

    const chunks: unknown[] = [];
    let endCount = 0;
    const controller = await transport.stream(ClipboardEvents.change, undefined, {
      onData: chunk => chunks.push(chunk),
      onEnd: () => {
        endCount += 1;
      },
      port: { channel: eventName, timeoutMs: 0 },
    });

    currentHandlers.get(`${eventName}:stream:data:${controller.streamId}`)?.({
      header: { status: "request" },
      data: { chunk: { phase: "channel-snapshot" } },
    });
    currentHandlers.get(`${eventName}:stream:end:${controller.streamId}`)?.({});

    expect(chunks).toEqual([{ phase: "channel-snapshot" }]);
    expect(endCount).toBe(1);
    expect(sent).toContainEqual({
      eventName: TransportEvents.port.close.toEventName(),
      payload: {
        channel: eventName,
        portId: "missing-renderer-port",
        reason: "confirm_timeout",
      },
    });
  });
});
