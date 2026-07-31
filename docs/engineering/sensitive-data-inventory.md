# Sensitive Data Inventory

The executable inventory is [`sensitive-data-inventory.json`](./sensitive-data-inventory.json). It is the maintained map for sensitive and retained data owned by CoreApp and official plugins.

Run:

```bash
corepack pnpm privacy:inventory:verify
```

The verifier checks:

- schema shape, unique IDs, required owners and lifecycle fields;
- evidence paths and required high-risk surfaces;
- credential storage/export invariants and non-portable identity exclusions;
- Core provider renderer-storage redaction and typed main-owned save/delete wiring;
- official Translation main-owned migration plus atomic Secret batch wiring;
- canonical typed Privacy and plugin-uninstall transport usage.

Update the inventory in the same change that adds a sensitive persistence surface, changes an owner, makes data portable, changes retention/deletion semantics, or changes renderer exposure. A prose-only lifecycle claim is incomplete until the JSON and verifier pass.
