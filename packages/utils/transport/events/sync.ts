import { defineEvent } from "../event/builder";

export interface SyncStartRequest {
  reason?: string;
}

export interface SyncStopRequest {
  reason?: string;
}

export interface SyncTriggerRequest {
  reason?: "user" | "focus" | "online";
}

export interface SyncOperationResponse {
  success: boolean;
}

export const SyncEvents = {
  lifecycle: {
    start: defineEvent("sync")
      .module("lifecycle")
      .event("start")
      .define<SyncStartRequest, SyncOperationResponse>(),
    stop: defineEvent("sync")
      .module("lifecycle")
      .event("stop")
      .define<SyncStopRequest, SyncOperationResponse>(),
    trigger: defineEvent("sync")
      .module("lifecycle")
      .event("trigger")
      .define<SyncTriggerRequest, SyncOperationResponse>(),
  },
} as const;
