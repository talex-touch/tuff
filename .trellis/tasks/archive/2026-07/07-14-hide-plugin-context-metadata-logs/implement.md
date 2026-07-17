# Implementation Plan

1. Add checkpoint and package-log methods to the plugin Intelligence host-only facade set.
2. Assert host ownership before both ContextHygiene query service calls.
3. Update facade/context boundary tests for plugin denial, zero service access, host preservation, and safe context method availability.
4. Correct plugin SDK/API docs, AI status/changelog, and frontend security guidance.
5. Run focused tests, targeted lint, CoreApp node type-check, AI docs verifier, and diff check.

Rollback: revert the two facade entries and two handler assertions together; storage/schema and canonical host SDK are unchanged.
