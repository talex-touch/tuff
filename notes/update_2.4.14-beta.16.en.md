# Tuff v2.4.14-beta.16 Release Notes

## Summary Notes

- **Fixed blank CoreBox and main windows:** preload now resolves from the Electron application root, preventing electron-vite's `out/main/chunks` output from redirecting it to the nonexistent `out/main/preload` path.
- **Unified desktop-window startup contracts:** Main, CoreBox, Division, Assistant, Screenshot, and OmniPanel now share one verified preload entry so the IPC bridge initializes consistently in every window.
- **Closed the release regression gap:** Electron mocks now implement the `app.getAppPath()` contract; the full CoreApp suite, workspace type checking, release gates, and a live CoreBox startup smoke all pass.

## What's Changed

- **CoreApp window startup**

- Centralized the preload entry at `app.getAppPath()/out/preload/index.js` instead of deriving it from the emitted chunk's `__dirname`. Tests retain a `process.cwd()` fallback so lightweight Electron mocks can import the configuration safely.
- Reused the entry across all eight `BrowserWindow` configurations, fixing the preload `ENOENT` that removed `window.electron.ipcRenderer`, prevented Vue from mounting, and left CoreBox as an empty panel.

- **Verification**

- GitHub PR CI passed workspace type checking, CoreApp/Nexus/integration suites, documentation quality, PR Quality, and CodeQL.
- A live macOS development startup mounted the main renderer; CoreBox displayed its input, placeholder, and controls, and the recommendation engine returned eight items.
- This remains a Beta prerelease. After upgrading, verify the main window and the CoreBox shortcut path before broad rollout.
