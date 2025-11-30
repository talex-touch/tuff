# Plugin Ecosystem

## Philosophy
- Plugins are capsules with dedicated sandboxes and 10 MB storage quotas.
- Manifests declare metadata, entry points, and permissions; `pnpm utils:publish` distributes them.
- CoreBox aggregates plugin commands for search, shortcuts, and workflows.

## Types
| Type | Description | Examples |
| --- | --- | --- |
| Functional | UI, events, or services | Task capture, translation, scripts |
| Widget | Lives in workspace or notification center | Dashboards, timers, snapshots |
| Workflow | API-only | Batch operations, automation chains |

## Discover & Manage
1. Open CoreBox, type `market`.
2. Filter by tags, rating, or search; click Add to install.
3. Manage versions, permissions, and status via Settings → Plugins.

## Security
- Plugins run in isolated processes and talk through Channel APIs.
- Sensitive permissions trigger consent sheets and runtime prompts.
- Over-budget plugins are paused automatically.

## Starter Stack
- **Core efficiency**: Clipbox, Universal Search, Task Capsule.
- **Engineering**: Git Watcher, API Tester, Snippet Vault.
- **Creative**: Color Studio, Asset Board, Storyboard.
