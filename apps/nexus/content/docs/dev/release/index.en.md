# Release & Download

This section documents the maintained Nexus release/download routes and the
desktop Download SDK. Plugin publishing is covered by the plugin development
workflow rather than a separate publish page.

## Release routes

| Purpose | Route |
| --- | --- |
| Release metadata | `GET /api/releases/{tag}` |
| Latest release by channel | `GET /api/releases/latest?channel={channel}` |
| Platform asset matrix | `GET /api/releases/{tag}/assets` |
| Platform download | `GET /api/releases/{tag}/download/{platform}/{arch}` |
| Platform signature | `GET /api/releases/{tag}/signature/{platform}/{arch}` |

These are server routes, not direct methods on the renderer Download SDK.
CoreApp update services resolve release metadata and then schedule downloads
through Download Center.

## Documentation

- [Download SDK](../api/download.en.mdc)
- [Plugin development and publishing workflow](../getting-started/plugin-workflow.en.mdc)
- [Performance and persistence rollout](./performance-persistence.en.md)
- [Repository release-assets checklist](../../../../../../docs/plan-prd/docs/NEXUS-RELEASE-ASSETS-CHECKLIST.md)
- [Chinese version](./index.zh.md)
