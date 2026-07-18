export const INTELLIGENCE_ERROR_CODES = [
  "NEXUS_AUTH_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "QUOTA_EXHAUSTED",
  "QUOTA_CHECK_UNAVAILABLE",
  "MODEL_UNSUPPORTED",
  "PERMISSION_DENIED",
  "NETWORK_FAILURE",
  "CAPABILITY_UNSUPPORTED",
  "INVALID_REQUEST",
  "UNKNOWN",
] as const;

export type IntelligenceErrorCode = (typeof INTELLIGENCE_ERROR_CODES)[number];

export function isIntelligenceErrorCode(
  value: unknown,
): value is IntelligenceErrorCode {
  return (
    typeof value === "string" &&
    (INTELLIGENCE_ERROR_CODES as readonly string[]).includes(value)
  );
}
