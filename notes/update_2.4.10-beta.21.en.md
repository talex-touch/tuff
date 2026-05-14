# Tuff v2.4.10-beta.21 Release Notes

## Highlights

- Fixed the OmniPanel Gate lint blocker caused by reading `globalThis.$app` in the main-process module; the module now keeps the `TouchApp` reference from its lifecycle context.
- Replaced a renderer-side bare `console.error` in OmniPanel with the renderer logger.
- Updated the Utils transport boundary baseline to match the current retained raw definition scan.
- Added local ESLint configs for the `clipboard-history` and `touch-dev-utils` plugins, and fixed clipboard history event naming / formatting issues so plugin quality checks can run independently.
- Fixed lint issues in the tuff-cli bin entries and the tuff-native screenshot build script to keep the broader quality chain moving.
- Verified locally that the macOS beta build produces a usable `.app.zip` and that the app bundle version matches the package version.

## Known Limitations

- This is still a beta test package and does not mean the stable `2.4.10` release gate is complete.
- Windows real-device acceptance, performance sampling, and Nexus Release Evidence sync remain blockers for the stable release.
