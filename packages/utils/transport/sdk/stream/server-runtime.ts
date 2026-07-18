import type { TransportPortEnvelope } from "../../events";
import type { StreamContext } from "../../types";
import {
  buildStreamDataEnvelope,
  buildStreamEndEnvelope,
  buildStreamErrorEnvelope,
  getStreamEventNames,
  toStreamError,
} from "./protocol";

export interface ServerStreamRequest<TReq, TSender, TPlugin = unknown> {
  streamId: string;
  portId?: string;
  payload: TReq;
  sender: TSender;
  plugin?: TPlugin;
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
  handleCancel: (streamId?: string | null) => void;
}

export function createServerStreamRuntime<
  TReq,
  TChunk,
  TSender,
  TPlugin = unknown,
>(
  config: ServerStreamRuntimeConfig<TReq, TChunk, TSender, TPlugin>,
): ServerStreamRuntime<TReq, TSender, TPlugin> {
  const states = new Map<
    string,
    { cancelled: boolean; closed: boolean; abortController: AbortController }
  >();
  const streamEvents = getStreamEventNames(config.eventName);

  const handleCancel = (streamId?: string | null) => {
    if (!streamId) {
      return;
    }
    const state = states.get(streamId);
    if (!state || state.closed || state.cancelled) return;
    state.cancelled = true;
    state.abortController.abort();
    states.delete(streamId);
  };

  const handleStart = (
    request: ServerStreamRequest<TReq, TSender, TPlugin>,
  ) => {
    const { streamId } = request;
    const state = {
      cancelled: false,
      closed: false,
      abortController: new AbortController(),
    };
    states.set(streamId, state);

    const cleanup = () => {
      if (states.get(streamId) === state) states.delete(streamId);
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

    const baseContext: Omit<
      StreamContext<TChunk>,
      "sender" | "eventName" | "plugin"
    > = {
      emit: (chunk: TChunk) => {
        if (state.cancelled || state.closed) {
          return;
        }

        const portSent = sendPortMessage(
          buildStreamDataEnvelope(
            config.eventName,
            streamId,
            chunk,
            portAdapter?.portId,
          ),
        );
        if (!portSent) {
          config.sendFallback(request, streamEvents.data(streamId), { chunk });
        }
      },
      error: (error: Error) => {
        if (state.cancelled || state.closed) {
          return;
        }

        state.closed = true;
        const streamError = toStreamError(error);
        const portSent = sendPortMessage(
          buildStreamErrorEnvelope(
            config.eventName,
            streamId,
            streamError.message,
            portAdapter?.portId,
          ),
        );
        if (!portSent) {
          config.sendFallback(request, streamEvents.error(streamId), {
            error: streamError.message,
          });
        }
        cleanup();
      },
      end: () => {
        if (state.cancelled || state.closed) {
          cleanup();
          return;
        }

        state.closed = true;

        const portSent = sendPortMessage(
          buildStreamEndEnvelope(
            config.eventName,
            streamId,
            portAdapter?.portId,
          ),
        );
        if (!portSent) {
          config.sendFallback(request, streamEvents.end(streamId), {});
        }
        cleanup();
      },
      isCancelled: () => state.cancelled,
      signal: state.abortController.signal,
      streamId,
    };

    const streamContext = config.buildContext(request, baseContext);
    Promise.resolve(config.handler(request.payload, streamContext)).catch(
      (error) => {
        config.onHandlerError?.(error);
        streamContext.error(toStreamError(error));
      },
    );
  };

  return {
    handleStart,
    handleCancel,
  };
}
