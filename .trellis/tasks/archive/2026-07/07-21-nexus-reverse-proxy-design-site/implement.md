# Implementation Plan

1. Add `apps/reverse-proxy-design` to the pnpm workspace and create an Astro static package with app-local scripts.
2. Create `PRODUCT.md` and `DESIGN.md` for the standalone site from the confirmed public/internal audience, dark control-plane direction, and palette artifact.
3. Implement the semantic page shell, navigation, hero trust-boundary visualization, current-state topology, evidence matrix, threat paths, control details, production posture, and remediation roadmap.
4. Add an app-local `wrangler.toml` for static assets and the approved custom domain. Do not touch the root Nexus Wrangler configuration.
5. Run the app build and inspect generated output. Run the targeted Impeccable layout/type detectors and resolve actionable findings.
6. Serve the built site locally and inspect desktop, tablet, and mobile viewports in Chromium. Check console errors, keyboard focus, reduced motion, overflow, and major section composition.
7. Deploy with Wrangler, capture the returned Worker/version/domain evidence, then open `https://tuff-reverse-proxy-design.tagzxia.com` and verify the live page.
8. Update task acceptance criteria with observed build, browser, and deployment evidence. Keep local and live claims separate.

## Validation Commands

```bash
pnpm --filter @talex-touch/reverse-proxy-design build
pnpm --filter @talex-touch/reverse-proxy-design preview
pnpm --filter @talex-touch/reverse-proxy-design deploy
```

## Risk and Rollback Points

- Workspace/lockfile changes: limited to the new Astro package and its direct dependencies.
- Custom-domain binding: deploy only after the local browser smoke passes. Existing DNS/Worker collisions must fail visibly; do not force replacement silently.
- Production rollback: restore the prior Worker version/domain mapping through Cloudflare Worker version management if the live smoke fails.
- Content safety: generated output must contain no local secret values or private environment contents.
