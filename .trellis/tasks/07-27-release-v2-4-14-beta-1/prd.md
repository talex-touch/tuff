# 发布 v2.4.14-beta.1

## Goal

Prepare and publish v2.4.14-beta.1 with verified desktop release assets, Nexus metadata, and a successful Cloudflare Pages deployment for the release commit.

## Requirements

- Validate the beta release through the repository release workflow, which publishes `v*-beta*` tags as pre-releases and emits the updater release manifest alongside platform artifacts.
- Treat the user's explicit release request as publication authorization; the parent batch records this child's completed evidence after publication instead of blocking the child on itself.
- Restore the Nexus Cloudflare Pages build when the latest production deployments are failing, and verify the deployed custom domain rather than relying only on a local build.

## Acceptance Criteria

- [ ] Exact v2.4.14-beta.1 bilingual release notes satisfy the strict contract, root/Core versions match, and local release gates pass before tag publication.
- [ ] Nexus focused tests, typecheck, production build, static route checks, and local Wrangler route smoke pass for the release candidate.
- [ ] The `v2.4.14-beta.1` tag publishes a non-draft GitHub prerelease with signed manifest and platform assets, then synchronizes the same release to Nexus.
- [ ] Cloudflare Pages reports a successful production deployment for the release commit, and `https://tuff.tagzxia.com` plus representative docs and release endpoints return `2xx` with expected content.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
