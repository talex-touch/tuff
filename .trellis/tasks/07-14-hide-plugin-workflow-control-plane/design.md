# Design: Host-Owned Persisted Workflow Control Plane

The canonical `IntelligenceSdk` stays unchanged for CoreApp renderer use. The plugin `Omit` facade adds all seven persisted workflow methods to its existing host-only set. `workflow.execute()` remains available because it is a capability wrapper governed by the verified invoke/stream boundary; it does not expose the shared persisted registry.

`IntelligenceModule.registerWorkflowChannels()` switches from permission registration to the existing host-only registrar. Host ownership is asserted before payload validation or service/runtime access. Since plugin calls cannot enter these handlers, workflow-run caller rebinding and the nested autonomous permission check are obsolete there; host payload objects pass directly to the service, preserving identity.

This is a clean fail-closed cutover. Reintroducing plugin persisted workflows requires an explicit immutable owner/namespace in definitions and run records plus migration and cross-plugin tests; a permission grant alone is not ownership.
