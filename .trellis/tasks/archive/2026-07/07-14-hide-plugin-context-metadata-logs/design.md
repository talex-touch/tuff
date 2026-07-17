# Design: Host-Owned Context Metadata Queries

The canonical `IntelligenceSdk` remains unchanged for CoreApp renderer code. The plugin `Omit` facade adds `contextListCheckpoints` and `contextListPackageLogs` to its existing context host-only set. `contextInvoke`, `contextStream`, and the pure host policy evaluator remain available.

CoreApp keeps the existing protected transport registration but performs the standard host-ownership assertion at the start of both query handlers. This rejects raw plugin events before ContextHygieneService/SQLite work while retaining normal host payloads and results.

No redaction-only or session-ID possession scheme is introduced: arbitrary metadata and optional unscoped package-log queries require a durable verified owner before a plugin-safe variant can exist.
