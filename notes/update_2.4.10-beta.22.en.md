# Tuff v2.4.10-beta.22 Release Notes

## Highlights

- Merged the latest `master` improvements for plugin Widget build and registry flows, including builder widget export coverage and runtime regressions.
- Aligned the tuff-cli SDK marker hard-cut: `260421` is no longer a supported marker, keeping the CoreApp runtime gate, `tuff validate`, and the shared SDK allowlist consistent.
- Expanded CLI Package CI path coverage and externalized the optional `@vue/compiler-sfc` dependency so SDK compatibility and optional Vue SFC template changes are not missed.
- Archived the cross-platform compatibility and placeholder implementation deep review, keeping the remaining risks scoped to `2.4.11` instead of promoting them to current `2.4.10` stable blockers.
- Carries forward the beta.21 readiness work for OmniPanel, the Utils transport boundary baseline, plugin lint/test gates, and the local macOS beta build.

## Known Limitations

- This is still a beta test package and does not mean the stable `2.4.10` release gate is complete.
- Windows real-device acceptance, performance sampling, and Nexus Release Evidence sync remain blockers for the stable release.
