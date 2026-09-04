# Design: Remote application alias catalog

## Decision

Add `app-semantic-alias` as a second signed whole-pack type in the existing CatalogService family. Keep the domain lexicon and application alias registries separate: their entry models, consumers, and persistence rows differ, so a shared generic JSON blob would discard type safety and make indexed-app reprojection ambiguous.

## Data flow

```text
Nexus immutable manifest + content-addressed JSON
  -> NetworkService -> pinned RSA verifier -> strict shared normalizer
  -> SQLite transaction -> explicit activation
  -> active alias registry facade -> installed-app reprojection -> search index
```

The client derives artifact URLs from verified manifest fields. Nexus is an availability source only; it never supplies a verification key. If any remote or persistence step fails, the active registry and indexed aliases remain unchanged.

## Contract

`app-semantic-alias` entries contain:

- stable dotted ID;
- one or more narrow identity needles, grouped by `bundleIds`, `names`, and `basenames`;
- domain identifiers from the existing application semantic vocabulary;
- optional proper-noun aliases.

The shared normalizer owns unknown-key rejection, string/entry bounds, duplicate detection, identity-needle validation, and locale-aware alias expansion. Category vocabulary remains one source of truth and still provides English pluralization. Application matching remains local because it depends on scanned identity fields and existing token semantics.

## Persistence and activation

A new typed entry table references the existing catalog pack identity. The shared `catalog_packs` and `catalog_state` keys expand to the second type. Import writes pack metadata and typed rows in one transaction. Activate and rollback rebuild the immutable active application alias registry from SQLite and only then publish it. The in-memory built-in baseline remains available when SQLite cannot initialize.

## Runtime integration

`resolveAppSemanticAliases` reads an active facade rather than the static entry array. AppProvider receives an activation callback that schedules targeted reprojection of installed app rows through its existing index write path. A typed transport operation exposes explicit `check → download → import → activate` and low-sensitive status. No startup fetch, background polling, or renderer-side parsing is introduced.

## Nexus API

Nexus serves a configured stable artifact set through:

- `GET /api/v1/catalogs/app-semantic-alias/latest`
- `GET /api/v1/catalogs/app-semantic-alias/:packId/:version/:sha256.json`

The server validates route identity against a static server-side catalog-artifact projection and responds with raw stored bytes. It does not parse, sign, or mutate payloads at request time. Authoring and production storage are intentionally deferred.

## Compatibility and rollback

The current static catalog becomes the built-in pack, so first launch retains all prior aliases and adds Ghostty/cmux/Orca. A catalog-schema migration is additive. Any activated remote pack can roll back to the previous built-in or remote pack; activation failure retains the prior registry and indexed aliases.
