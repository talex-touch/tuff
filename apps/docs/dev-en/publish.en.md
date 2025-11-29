# Publish Flow

## Prep
1. Bump the version and update the changelog.
2. Run `pnpm lint` and `pnpm utils:test`.
3. Review manifest permissions, keywords, screenshots.

## Build
```bash
pnpm build
```
- Outputs `dist/` with `manifest.json`, `index.js`, assets, and signatures.
- Use `pnpm core:build:snapshot` to verify the desktop bundle loads correctly.

## Submit to Marketplace
1. Upload `dist.zip` in the developer console.
2. Provide release notes and workspace compatibility.
3. Automated checks validate permissions, performance, and crash metrics.

## After Approval
- Updates roll out to followers automatically.
- Choose between “force update” or “optional update”.

## Private Distribution
- Enterprises can upload signed internal builds visible only to the org.
- Private packages keep versioning and rollback controls.

## Troubleshooting
- Review failures in `logs/review/<id>.txt`.
- `pnpm utils:publish --dry-run` catches missing fields before submission.
