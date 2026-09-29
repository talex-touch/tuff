# Tuff v2.4.14-beta.48 Release Notes

## Summary Notes

- Packaged Settings no longer expose the development-only Nexus service address editor.
- The main window stays visible after the onboarding shortcut is verified instead of hiding immediately.
- Users can explicitly keep exploring the main window or hide it and open CoreBox.

## What's Changed

- Restrict the Nexus service address editor to development builds so release packages do not expose debug configuration.
- Update shortcut completion in first-run onboarding to present a two-action choice before finalizing the window transition.
- “Keep exploring” leaves the main window visible without summoning CoreBox; “Hide and open CoreBox” preserves the original quick-entry path.
