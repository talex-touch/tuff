import type { TransportPortEnvelope } from "../../events";
import type { StreamErrorPayload, StreamMessage } from "../../types";
import { STREAM_SUFFIXES } from "../constants";

const STABLE_STREAM_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,127}$/;

export interface StreamEventNames {
  start: string;
  cancel: string;
  data: (streamId: string) => string;
  end: (streamId: string) => string;
  error: (streamId: string) => string;
}

function readProperty(value: unknown, key: string): unknown {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return undefined;
  }

  try {
    return (value as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const property = readProperty(value, key);
  return typeof property === "string" ? property : undefined;
}

function stringifySafely(value: unknown): string | undefined {
  try {
    return String(value);
  } catch {
    return undefined;
  }
}

function isStableStreamErrorCode(value: unknown): value is string {
  return typeof value === "string" && STABLE_STREAM_ERROR_CODE.test(value);
}

/**
 * Converts caller-owned failures into a new, serializable projection without
 * trusting property getters or toString implementations.
 */
export function projectStreamError(
  error: unknown,
  fallback = "Stream error",
): StreamErrorPayload {
  const safeFallback =
    typeof fallback === "string" && fallback ? fallback : "Stream error";
  let message: string | undefined;

  if (typeof error === "string") {
    message = error;
  } else if (error !== undefined && error !== null) {
    message = readStringProperty(error, "message") ?? stringifySafely(error);
  }

  const normalizedMessage = message || safeFallback;
  const explicitCode = readStringProperty(error, "code");
  const code = isStableStreamErrorCode(explicitCode)
    ? explicitCode
    : isStableStreamErrorCode(normalizedMessage)
      ? normalizedMessage
      : undefined;

  return {
    message: normalizedMessage,
    ...(code ? { code } : {}),
  };
}

export function createStreamId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function getStreamEventNames(eventName: string): StreamEventNames {
  return {
    start: `${eventName}${STREAM_SUFFIXES.START}`,
    cancel: `${eventName}${STREAM_SUFFIXES.CANCEL}`,
    data: (streamId) => `${eventName}${STREAM_SUFFIXES.DATA}:${streamId}`,
    end: (streamId) => `${eventName}${STREAM_SUFFIXES.END}:${streamId}`,
    error: (streamId) => `${eventName}${STREAM_SUFFIXES.ERROR}:${streamId}`,
  };
}

export function buildStreamStartPayload<TReq>(
  payload: TReq,
  streamId: string,
  portId?: string,
): { streamId: string; __transportPortId?: string } {
  const requestPayload =
    payload && typeof payload === "object" ? (payload as object) : {};
  return {
    ...requestPayload,
    streamId,
    ...(portId ? { __transportPortId: portId } : {}),
  };
}

export function unwrapChannelPayload<T>(raw: unknown): T {
  if (!raw || typeof raw !== "object") {
    return raw as T;
  }

  const record = raw as Record<string, unknown>;
  if ("data" in record && "header" in record) {
    return record.data as T;
  }

  return raw as T;
}

export function normalizePortStreamMessage<TChunk>(
  raw: unknown,
): StreamMessage<TChunk> | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const rawType = readStringProperty(raw, "type");
  const rawStreamId = readProperty(raw, "streamId");
  if (!rawType || rawStreamId === undefined || rawStreamId === null) {
    return null;
  }

  const streamId = stringifySafely(rawStreamId);
  if (streamId === undefined) {
    return null;
  }

  if (rawType === "data") {
    const payload = readProperty(raw, "payload");
    const chunk =
      (readProperty(raw, "chunk") as TChunk | undefined) ??
      (readProperty(payload, "chunk") as TChunk | undefined);
    return { type: "data", streamId, chunk };
  }

  if (rawType === "error") {
    const envelopeError = readProperty(raw, "error");
    const payload = readProperty(raw, "payload");
    const errorMessage =
      typeof envelopeError === "string"
        ? envelopeError
        : (readStringProperty(envelopeError, "message") ??
          readStringProperty(payload, "error"));
    const envelopeCode = readStringProperty(envelopeError, "code");
    const payloadCode = readStringProperty(payload, "code");
    const code = isStableStreamErrorCode(envelopeCode)
      ? envelopeCode
      : isStableStreamErrorCode(payloadCode)
        ? payloadCode
        : undefined;
    const errorSource =
      errorMessage === undefined
        ? code
        : { message: errorMessage, code };
    return {
      type: "error",
      streamId,
      error: projectStreamError(errorSource),
    };
  }

  if (rawType === "end" || rawType === "close") {
    return { type: "end", streamId };
  }

  return null;
}

export function buildStreamDataEnvelope<TChunk>(
  eventName: string,
  streamId: string,
  chunk: TChunk,
  portId?: string,
): TransportPortEnvelope<{ chunk: TChunk }> {
  return {
    channel: eventName,
    portId,
    streamId,
    type: "data",
    payload: { chunk },
  };
}

export function buildStreamErrorEnvelope(
  eventName: string,
  streamId: string,
  error: unknown,
  portId?: string,
): TransportPortEnvelope<{ error: string; code?: string }> {
  const projection = projectStreamError(error);
  return {
    channel: eventName,
    portId,
    streamId,
    type: "error",
    payload: {
      error: projection.message,
      ...(projection.code ? { code: projection.code } : {}),
    },
    error: {
      code: "stream_error",
      message: projection.message,
    },
  };
}

export function buildStreamEndEnvelope(
  eventName: string,
  streamId: string,
  portId?: string,
): TransportPortEnvelope {
  return {
    channel: eventName,
    portId,
    streamId,
    type: "close",
  };
}

export function toStreamError(
  error: unknown,
  fallback = "Stream error",
): Error {
  const projection = projectStreamError(error, fallback);
  const streamError = new Error(projection.message) as Error & {
    code?: string;
  };
  if (projection.code) {
    streamError.code = projection.code;
  }
  return streamError;
}
