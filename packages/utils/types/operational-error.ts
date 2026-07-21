export type OperationalErrorSeverity = "warning" | "error" | "fatal";

export type OperationalErrorUserImpact =
  | "none"
  | "degraded"
  | "blocked"
  | "data-risk";

export type OperationalErrorContextValue =
  | string
  | number
  | boolean
  | null
  | undefined;

export interface OperationalErrorInput {
  domain: string;
  operation: string;
  error: unknown;
  code?: string;
  severity?: OperationalErrorSeverity;
  retryable?: boolean;
  userImpact?: OperationalErrorUserImpact;
  context?: Record<string, OperationalErrorContextValue>;
  publicMessage?: string;
  dedupeWindowMs?: number;
  captureDetail?: boolean;
}

export interface OperationalErrorReport {
  id: string;
  domain: string;
  operation: string;
  code: string;
  severity: OperationalErrorSeverity;
  retryable: boolean;
  userImpact: OperationalErrorUserImpact;
  publicMessage: string;
  occurredAt: number;
  occurrenceCount: number;
  context: Record<string, string | number | boolean>;
}
