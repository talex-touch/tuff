# Review wlcb1 new-api update dry-run

## Goal

Assess how far the `wlcb1` deployment is from `https://github.com/QuantumNous/new-api` and produce a dry-run style update report without applying changes.

## Requirements

- SSH to `wlcb1` and identify the current `new-api` deployment location, git remote, branch, and commit.
- Compare the local deployment against the upstream `QuantumNous/new-api` default branch and/or configured origin.
- Inspect deployment metadata such as Docker/compose files, runtime versions, dirty working tree, and recent commits when available.
- Summarize update distance, likely risk areas, and recommended next dry-run/update commands.
- Do not run real update, restart, migration, container rebuild, destructive git operations, or production write actions.

## Acceptance Criteria

- [x] Remote deployment directory and current version are identified.
- [x] Upstream target branch and latest commit are identified.
- [x] Ahead/behind or equivalent commit delta is reported.
- [x] Local uncommitted changes and deployment files are noted.
- [x] Final report distinguishes safe read-only checks from commands that would mutate state.

## Findings

See `report.md` in this task directory for the dry-run result.

## Notes

- Scope is one-time review only.
- User explicitly wants dry-run assessment before deciding whether to update.
- Deployment is Docker/1Panel image-based rather than a local source checkout.
