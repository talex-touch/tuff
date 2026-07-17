# Hide Plugin Agent Session Runtime

## Goal

Keep high-level agent.run/workflow.execute available, but remove low-level host session/orchestrator/tool methods from the plugin facade and reject raw plugin transport calls.

## Background

The plugin facade currently removes quota, provider-admin, Memory-management, and environment methods but still exposes low-level `agentSession*`, `agentPlan/Execute/Reflect`, and `agentTool*` runtime methods. Their handlers accept caller-supplied session IDs; trace/history handlers have no permission guard, and trace subscription can pause the referenced session on disconnect. The runtime has no plugin-owner field for enforcing cross-plugin session isolation.

## Requirements

- Keep the high-level typed `intelligence.agent.run()` and `intelligence.workflow.execute()` capability wrappers available to plugins.
- Remove every low-level agent session/orchestrator/tool method from the plugin facade type and runtime proxy.
- Reject direct/raw plugin transport calls to the same request and stream events with canonical `INTELLIGENCE_HOST_ONLY_CAPABILITY` before runtime lookup, mutation, subscription, or disconnect side effects.
- Preserve the full low-level SDK and behavior for CoreApp renderer host callers.
- Correct plugin-facing docs so high-level capability wrappers are not conflated with host-only session runtime APIs.

## Acceptance Criteria

- [x] Plugin facade omits all `agentSession*`, `agentPlan`, `agentExecute`, `agentReflect`, and `agentTool*` methods while retaining `agent.run` and `workflow.execute`.
- [x] Raw plugin history/trace/state/mutation calls fail with `INTELLIGENCE_HOST_ONLY_CAPABILITY` and do not call runtime methods.
- [x] Raw plugin trace subscription fails before query/subscription/pause side effects; host trace subscription remains supported.
- [x] Focused facade/handler/stream tests, CoreApp node type-check, targeted lint, AI docs verification, and diff check pass.
- [x] README/API/TODO/CHANGES and frontend security guidance state the host-only session boundary without implying high-level agent capability removal.

## Out of Scope

- Adding session ownership metadata, plugin-owned session lifecycle APIs, workflow registry isolation, changing high-level `agent.run`/`workflow.execute`, provider selection, or quota policy.
