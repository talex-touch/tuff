# Plugin release evidence checklist

Manifest SoT: `plugin-release-evidence-manifest.json`

| Record | Minimum level | Result | Evidence |
| --- | --- | --- | --- |
| `source-build` | packaged | passed | `records/source-build.json` |
| `package-policy` | packaged | passed | `records/package-policy.json` |
| `security-scan` | packaged | passed | `records/security-scan.json` |
| `publisher-signature` | packaged | passed | `records/publisher-signature.json` |
| `real-upload` | real-upload | passed | `records/real-upload.json` |
| `nexus-attestation` | deployed | passed | `records/nexus-attestation.json` |
| `store-eligibility` | deployed | passed | `records/store-eligibility.json` |
| `artifact-download` | real-upload | passed | `records/artifact-download.json` |
| `coreapp-install` | real-upload | passed | `records/coreapp-install.json` |
| `duplicate-upload` | real-upload | passed | `records/duplicate-upload.json` |
| `retention` | deployed | passed | `records/retention.json` |

## Acceptance mapping

- Digest continuity: every record and projection uses `56acb408adfc26d30cd49aedf77dec6c272b77f5ed91f2367927f0180ee08aff`.
- Real persistence: upload governance reports `d1`, `r2`, and `cloudflare-r2`; the object survived later production deployments and was downloaded by the CoreApp provider.
- Display isolation: BETA list/search/detail/download succeed only for the moderated BETA audience; public list/search/detail remain unavailable.
- Trust chain: publisher key `acceptance-publisher-9ffc95274660` and Nexus key `nexus-plugin-attestation-2026-01` both verify the artifact-bound payload.
- Install behavior: provider `tpex` reached 100% download, installed the package, loaded its entry, and produced uppercase plus Base64 results.
- Idempotency: duplicate publish failed with HTTP 400; D1 remained at one matching version and R2 remained at one matching artifact with no inventory delta.
- Retention: the dedicated version remains retained in controlled BETA and is not publicly visible.

## Verification

```text
pnpm exec vitest run scripts/plugin-release-evidence.test.mjs
node scripts/plugin-release-evidence.mjs <manifest> --strict --write-output
node scripts/plugin-release-evidence.mjs <manifest> --strict
```
