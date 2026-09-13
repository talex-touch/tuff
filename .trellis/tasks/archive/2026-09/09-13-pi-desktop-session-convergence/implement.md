# Implementation: PI Desktop session convergence and migration audit

1. Complete and verify `09-13-external-native-session-adoption`.
2. Complete and verify `09-13-pi-native-session-authority` against the discovery/store contracts.
3. Complete `09-13-pi-desktop-migration-audit` using current PI-Desktop main and current Tuff source.
4. Run combined transport, main-process, renderer, migration, privacy, lint, and typecheck gates.
5. Use an isolated Electron profile and throwaway provider archives/stub to verify discovery, native Pi continuation, restart, lease rejection, missing-session behavior, and absence of transcript leakage.
6. Update the directly affected main-process spec and competitive-analysis report.
7. Commit implementation and task artifacts without pushing unless the user requests it.
