# CoreApp Browser Smoke Boundary

> Date: 2026-05-17
> Scope: Browser-only smoke against the CoreApp renderer dev URL.

## Summary

This smoke opened `http://127.0.0.1:5173/#/setting` in a normal browser context.
It produced a blank page and does not count as CoreApp visible-experience evidence.

CoreApp requires the Electron runtime and preload bridge. The browser console shows
`Cannot read properties of undefined (reading 'ipcRenderer')`, so this result only
proves that a plain browser smoke is not a valid substitute for Electron UI capture.

## Artifacts

- `setting-browser-white-screen.png` - screenshot of the blank browser page.
- `browser-console.log` - console output from the browser-only smoke.

## Completion Impact

The following visible-experience items remain missing and must still be collected
from Electron or a current packaged build:

- first usable CoreApp screen,
- CoreBox search states,
- login failure recovery,
- permission/provider/capability failure states,
- CoreBox AI Ask,
- OmniPanel Writing Tools,
- Workflow Use Model / Review Queue.
