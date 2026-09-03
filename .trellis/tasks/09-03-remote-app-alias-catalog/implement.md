# Implementation plan: Remote application alias catalog

## Steps

1. Extend shared catalog contracts with the new pack type, strict application alias entry normalizer, deterministic serializer/signing payload, and typed active registry facade. Move the current static entries into the built-in baseline and add Ghostty, cmux, and Orca.
2. Extend CoreApp schema, handwritten migration, repository, verifier, and catalog module to persist, initialize, import, activate, and roll back application alias packs independently of domain lexicons.
3. Make application semantic resolution read the active catalog facade. Wire CatalogService activation to a bounded installed-app alias reprojection using the existing search-index write path.
4. Add typed CoreApp catalog operations and status projection for explicit application-alias updates. Reuse the existing NetworkService adapter and fail closed on every remote/verifier/storage error.
5. Add Nexus immutable read routes backed by the committed stable artifact projection; add route tests for successful retrieval, identity mismatch, and absence.
6. Add focused contract, lifecycle, resolver, reprojection, transport, and Nexus route tests. Run scoped typechecks, relevant tests, and `git diff --check`.

## Risk gates

- Do not make `CatalogPackType` broader without updating every exhaustive validation and database enum.
- Do not use application display names as broad generic needles. Bundle ID and basename matches are preferred.
- Do not activate a remote pack before its transaction commits or reproject aliases before activation succeeds.
- Do not accept a signing key, artifact URL, or arbitrary request URL from a manifest.
- Do not claim production Nexus distribution: production secret/R2/D1 provisioning is explicitly out of scope.

## Rollback

The migration is additive. Application alias packs retain `previous` state independently by type. The explicit rollback operation restores the preceding pack and reprojects aliases. Removing the trigger leaves the built-in baseline active and does not affect application discovery.

## Verification

```text
packages/utils: focused i18n catalog and alias registry tests
apps/core-app: focused catalog, app-semantic-catalog, repository, transport, reprojection tests
apps/core-app: pnpm run typecheck:node
apps/nexus: focused catalog API tests and pnpm run typecheck
repository: git diff --check
```
