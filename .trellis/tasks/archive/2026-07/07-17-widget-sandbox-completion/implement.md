# Widget Sandbox Completion — Implementation Plan

1. Extend shared widget evidence/audit/quota/browser-policy contracts and add a reusable safe math parser.
2. Add renderer policy contexts, browser facades, quotas, audit retention, and dynamic-source preflight.
3. Wire the policy into widget evaluation, registration/update/unregister, and WidgetFrame DOM navigation guards.
4. Migrate CoreApp and PreviewSDK expression evaluators off generic mathjs evaluation.
5. Add focused contract tests for containment, isolation, quota, audit, lifecycle, and parser behavior.
6. Run focused tests, package typechecks, and a widget registration/mount smoke scenario; resolve all regressions.
