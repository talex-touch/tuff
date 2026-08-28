import type { TransportPortEnvelope } from "../../events";
import type { StreamContext } from "../../types";
import {
  buildStreamDataEnvelope,
  buildStreamEndEnvelope,
  buildStreamErrorEnvelope,
  getStreamEventNames,
  projectStreamError,
  toStreamError,
} from "./protocol";

export type ServerStreamOwnerKey = object;

export interface ServerStreamRequest<TReq, TSender, TPlugin = unknown> {
  streamId: string;
  ownerKey: ServerStreamOwnerKey;
  portId?: string;
  payload: TReq;
  sender: TSender;
  plugin?: TPlugin;
}

export interface ServerStreamCancelRequest {
  streamId?: string | null;
  ownerKey: ServerStreamOwnerKey;
}

export interface ServerStreamPortAdapter {
  portId?: string;
  send: (message: TransportPortEnvelope) => boolean;
}

export interface ServerStreamRuntimeConfig<
  TReq,
  TChunk,
  TSender,
  TPlugin = unknown,
> {
  eventName: string;
  portEnabled?: boolean;
  handler: (
    payload: TReq,
    context: StreamContext<TChunk>,
  ) => void | Promise<void>;
  buildContext: (
    request: ServerStreamRequest<TReq, TSender, TPlugin>,
    base: Omit<StreamContext<TChunk>, "sender" | "eventName" | "plugin">,
  ) => StreamContext<TChunk>;
  resolvePort?: (
    request: ServerStreamRequest<TReq, TSender, TPlugin>,
  ) => ServerStreamPortAdapter | null;
  sendFallback: (
    request: ServerStreamRequest<TReq, TSender, TPlugin>,
    channelName: string,
    payload: unknown,
  ) => void;
  onHandlerError?: (error: unknown) => void;
}

export interface ServerStreamRuntime<TReq, TSender, TPlugin = unknown> {
  handleStart: (request: ServerStreamRequest<TReq, TSender, TPlugin>) => void;
  handleCancel: (request: ServerStreamCancelRequest) => void;
  cancelOwner: (ownerKey: ServerStreamOwnerKey) => void;
  cancelAll: () => void;
  dispose: () => void;
}

export function createServerStreamRuntime<
  TReq,
  TChunk,
  TSender,
  TPlugin = unknown,
>(
  config: ServerStreamRuntimeConfig<TReq, TChunk, TSender, TPlugin>,
): ServerStreamRuntime<TReq, TSender, TPlugin> {
  type StreamState = {
    cancelled: boolean;
    closed: boolean;
    abortController: AbortController;
  };

  const statesByOwner = new Map<
    ServerStreamOwnerKey,
    Map<string, StreamState>
  >();
  const streamEvents = getStreamEventNames(config.eventName);
  let disposed = false;

  const cancelState = (state: StreamState) => {
    if (state.closed || state.cancelled) return;
    state.cancelled = true;
    try {
      state.abortController.abort();
    } catch {
      // One consumer's abort listener must not block host-owned cleanup.
    }
  };

  const cancelOwner = (ownerKey: ServerStreamOwnerKey) => {
    const ownerStates = statesByOwner.get(ownerKey);
    if (!ownerStates) return;

    statesByOwner.delete(ownerKey);
    const activeStates = [...ownerStates.values()];
    ownerStates.clear();
    for (const state of activeStates) {
      cancelState(state);
    }
  };

  const cancelAll = () => {
    for (const ownerKey of [...statesByOwner.keys()]) {
      cancelOwner(ownerKey);
    }
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAll();
  };

  const handleCancel = (request: ServerStreamCancelRequest) => {
    if (disposed) return;
    const { streamId, ownerKey } = request;
    if (!streamId) {
      return;
    }

    const ownerStates = statesByOwner.get(ownerKey);
    if (!ownerStates) return;
    const state = ownerStates.get(streamId);
    if (!state || state.closed || state.cancelled) return;
    ownerStates.delete(streamId);
    if (ownerStates.size === 0) {
      statesByOwner.delete(ownerKey);
    }
    cancelState(state);
  };

  const handleStart = (
    request: ServerStreamRequest<TReq, TSender, TPlugin>,
  ) => {
    if (disposed) return;
    const { streamId, ownerKey } = request;
    let ownerStates = statesByOwner.get(ownerKey);
    if (ownerStates?.has(streamId)) {
      throw Object.assign(
        new Error("[TuffTransport] Duplicate active stream identifier"),
        { code: "stream_id_conflict" },
      );
    }

    if (!ownerStates) {
      ownerStates = new Map<string, StreamState>();
      statesByOwner.set(ownerKey, ownerStates);
    }

    const state = {
      cancelled: false,
      closed: false,
      abortController: new AbortController(),
    };
    ownerStates.set(streamId, state);

    const cleanup = () => {
      if (ownerStates.get(streamId) !== state) {
        return;
      }
      ownerStates.delete(streamId);
      if (ownerStates.size === 0) {
        statesByOwner.delete(ownerKey);
      }
    };

    const portAdapter = config.portEnabled
      ? (config.resolvePort?.(request) ?? null)
      : null;

    const sendPortMessage = (message: TransportPortEnvelope): boolean => {
      if (!portAdapter) {
        return false;
      }
      return portAdapter.send(message);
    };

    const sendWithFallback = (
      message: TransportPortEnvelope,
      channelName: string,
      payload: unknown,
    ) => {
      let portSent = false;
      try {
        portSent = sendPortMessage(message);
      } catch {
        // A broken MessagePort is equivalent to an unavailable one.
      }

      if (!portSent) {
        config.sendFallback(request, channelName, payload);
      }
    };

    const baseContext: Omit<
      StreamContext<TChunk>,
      "sender" | "eventName" | "plugin"
    > = {
      emit: (chunk: TChunk) => {
        if (state.cancelled || state.closed) {
          return;
        }

        sendWithFallback(
          buildStreamDataEnvelope(
            config.eventName,
            streamId,
            chunk,
            portAdapter?.portId,
          ),
          streamEvents.data(streamId),
          { chunk },
        );
      },
      error: (error: Error) => {
        if (state.cancelled || state.closed) {
          return;
        }

        state.closed = true;
        const projection = projectStreamError(error);
        try {
          sendWithFallback(
            buildStreamErrorEnvelope(
              config.eventName,
              streamId,
              projection,
              portAdapter?.portId,
            ),
            streamEvents.error(streamId),
            {
              error: projection.message,
              ...(projection.code ? { code: projection.code } : {}),
            },
          );
        } finally {
          cleanup();
        }
      },
      end: () => {
        if (state.cancelled || state.closed) {
          cleanup();
          return;
        }

        state.closed = true;
        try {
          sendWithFallback(
            buildStreamEndEnvelope(
              config.eventName,
              streamId,
              portAdapter?.portId,
            ),
            streamEvents.end(streamId),
            {},
          );
        } finally {
          cleanup();
        }
      },
      isCancelled: () => state.cancelled,
      signal: state.abortController.signal,
      streamId,
    };

    const streamContext = config.buildContext(request, baseContext);
    const handleHandlerError = (error: unknown) => {
      try {
        config.onHandlerError?.(error);
      } catch {
        // Diagnostics must not block terminal delivery.
      }

      try {
        streamContext.error(toStreamError(error));
      } catch {
        // Terminal send failures are already cleaned up by streamContext.error().
      }
    };

    let handlerResult: void | Promise<void>;
    try {
      handlerResult = config.handler(request.payload, streamContext);
    } catch (error) {
      handleHandlerError(error);
      return;
    }

    Promise.resolve(handlerResult).catch(handleHandlerError);
  };

  return {
    handleStart,
    handleCancel,
    cancelOwner,
    cancelAll,
    dispose,
  };
}
