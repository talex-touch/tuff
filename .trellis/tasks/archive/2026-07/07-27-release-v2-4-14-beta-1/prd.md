# 发布 v2.4.14-beta.1

## Goal

Prepare and publish v2.4.14-beta.1 with verified desktop release assets, Nexus metadata, and a successful Cloudflare Pages deployment for the release commit.

## Requirements

- Validate the beta release through the repository release workflow, which publishes `v*-beta*` tags as pre-releases and emits the updater release manifest alongside platform artifacts.
- Treat the user's explicit release request as publication authorization; the parent batch records this child's completed evidence after publication instead of blocking the child on itself.
- Restore the Nexus Cloudflare Pages build when the latest production deployments are failing, and verify the deployed custom domain rather than relying only on a local build.

## Acceptance Criteria

- [x] Exact v2.4.14-beta.1 bilingual release notes satisfy the strict contract, root/Core versions match, and local release gates pass before tag publication.
- [x] Nexus focused tests, typecheck, production build, static route checks, and local Wrangler route smoke pass for the release candidate.
- [x] The `v2.4.14-beta.1` tag publishes a non-draft GitHub prerelease with signed manifest and platform assets, then synchronizes the same release to Nexus.
- [x] Cloudflare Pages reports a successful production deployment for the release commit, and `https://tuff.tagzxia.com` plus representative docs and release endpoints return `2xx` with expected content.

## Evidence

- Release commit/tag: `945a3a363b4fcaba9284a62705c0fb0454cc27fe` / `v2.4.14-beta.1`.
- Desktop build run `30682244609`: Windows, macOS, and Linux jobs succeeded; recovery run `30683124046` reused those provenance-checked artifacts and created the GitHub prerelease with 17 assets.
- Nexus sync run `30685052217`: metadata upsert, GitHub asset linking, and publish all succeeded; the build and create-release jobs were intentionally skipped.
- Cloudflare Production deployment `7675289c-c501-4c40-9e4d-f0422727ed62` succeeded for commit `6970d12cd3cf1197465edf41229dc8183a3560aa` after required encrypted runtime credentials were configured.
- Online smoke returned `200` for the home page, bilingual docs roots, representative development/component/guide pages, release lookup/latest/signing-key APIs, and a production CSS asset.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
