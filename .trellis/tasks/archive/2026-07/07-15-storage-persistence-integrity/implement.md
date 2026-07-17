# Implementation plan

1. Add one storage-key validator/resolver used by read and save paths.
2. Move validation ahead of cache/version mutation in transport-facing operations.
3. Add per-key failure state/backoff in the polling service and clear it on success or new valid mutation.
4. Cover flat keys, namespaced keys, traversal, separators, and dirty retry behavior with existing storage checks.
5. Exercise Prompt Library and DivisionBox save/reload against a temporary config root.
