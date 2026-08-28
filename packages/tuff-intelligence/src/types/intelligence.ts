/**
 * Forwards the intelligence types owned by `@talex-touch/utils`.
 *
 * This file used to re-declare 151 of them by hand next to a 58-name `export type { … }` list.
 * Every one of the 151 had a same-named declaration upstream and none was local: 149 were
 * byte-identical after whitespace normalisation, and the remaining two -- `DEFAULT_PROVIDERS`
 * and `DEFAULT_CAPABILITIES` -- were already assigned straight from the shared values. So the
 * copy carried no information, only the cost of keeping it in step (#520).
 *
 * The cost was not hypothetical. A drifted `IntelligenceMessage` crossed the IPC boundary
 * unnoticed because main-process code read the utils copy and renderer components read this one
 * (#519), and at the point of this rewrite two upstream types were reachable from neither the
 * forward list nor a local re-declaration -- invisible to the renderer until someone noticed.
 *
 * `export type *` forwards types only, so the nine value exports are listed explicitly. That
 * list is the one thing here that still needs maintaining, and it is short enough to see.
 */

export type * from "@talex-touch/utils/types/intelligence";

export {
  DEFAULT_CAPABILITIES,
  DEFAULT_GLOBAL_CONFIG,
  DEFAULT_PROVIDERS,
  INTELLIGENCE_CONVERSATION_TITLE_OPERATION,
  INTELLIGENCE_HOME_SURFACE,
  IntelligenceCapabilityType,
  IntelligenceProviderType,
  TUFF_INTELLIGENCE_AGENT_TRACE_CONTRACT_VERSION,
  TUFF_INTELLIGENCE_PROVIDER_SYNC_SCHEMA_VERSION
} from "@talex-touch/utils/types/intelligence";
