# Contributing to TuffEx

TuffEx is the Vue component source package used by CoreApp and Nexus.
Contributions should stay within the monorepo's component, test, build, and
documentation boundaries.

## Prerequisites

Use the versions declared by the repository root:

- Node.js `>=24.15.0`
- pnpm `10.34.4`
- Git

Install dependencies from the repository root:

```bash
pnpm install --frozen-lockfile
```

## Source layout

- `packages/components/src/<component>/`: component source, styles, exports,
  and colocated tests.
- `packages/components/src/components.ts`: component export inventory.
- `packages/utils/`: TuffEx utilities and shared helpers.
- `packages/script/`: package build scripts.
- `scripts/`: export, type, and package-size audits.
- [Nexus component docs](../../apps/nexus/content/docs/dev/components/index.en.mdc):
  public component documentation and examples.

Use an existing component as the directory and naming template. The
[button component guide](packages/components/src/button/README.md) is a tracked
example with source, styles, tests, and design notes.

## Development workflow

Run package checks from the repository root:

```bash
pnpm -C "packages/tuffex" run lint
pnpm -C "packages/tuffex" run typecheck
pnpm -C "packages/tuffex" run test
pnpm -C "packages/tuffex" run build
```

For a focused test during development:

```bash
pnpm -C "packages/tuffex" exec vitest run "packages/components/src/button/__tests__/button.test.ts"
```

Public package changes should also run the relevant audits:

```bash
pnpm -C "packages/tuffex" run audit:exports
pnpm -C "packages/tuffex" run audit:types
pnpm -C "packages/tuffex" run audit:size
```

Preview documentation through Nexus when public usage changes:

```bash
pnpm -C "apps/nexus" run dev
```

## Component changes

- Keep public component names in the established `Tx*` convention.
- Add or update colocated Vitest coverage for behavior changes.
- Preserve keyboard, focus, ARIA, and reduced-motion behavior.
- Export public components and types through the owning entry and inventory.
- Update the matching Nexus page when public usage or behavior changes.
- Reuse an existing primitive when it can own the required behavior.

## Documentation changes

Keep package build guidance in [README.md](README.md) and public component usage
in Nexus. Relative links must point to Git-tracked targets; do not create
placeholder pages to satisfy navigation.

## Pull requests

1. Read the
   [repository contribution guide](../../.github/docs/contribution/CONTRIBUTING.md).
2. Keep the change focused and use Conventional Commit syntax.
3. Include the exact validation commands and results in the pull request.
4. Use the
   [English pull request template](../../.github/PULL_REQUEST_TEMPLATE/en.md)
   or [Chinese template](../../.github/PULL_REQUEST_TEMPLATE/zh-CN.md).
5. Report defects with the
   [bug report template](../../.github/ISSUE_TEMPLATE/bug_report.md).

Do not publish packages from a contribution branch. Package releases and
registry credentials remain maintainer-owned workflows.
