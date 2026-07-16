# Design

Prompt schema synchronization compares semantic prompt fields before producing a replacement. Existing `updatedAt` is retained when the generated record is otherwise identical. A new timestamp is assigned only for insertion or semantic replacement.

The effective runtime signature remains the final guard before `TuffIntelligenceSDK.updateConfig`. Explicit force reload remains available but normal capability checks and storage notifications are idempotent.
