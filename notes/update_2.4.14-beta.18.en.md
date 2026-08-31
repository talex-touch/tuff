# Tuff v2.4.14-beta.18 Release Notes

## Summary Notes

- **Fixed macOS AutoPaste permission diagnostics:** a system-level keystroke denial after a successful clipboard write is no longer reported as a lost target focus.
- **Separated Accessibility from Automation permission failures:** System Events error 1002 now points to Accessibility, while Apple Events error -1743 keeps the Automation recovery path.
- **Aligned Intelligence plugin recovery guidance:** touch-intelligence now shows the same actionable permission path as the host when answer replacement fails.

## What's Changed

- Added the typed `MACOS_ACCESSIBILITY_PERMISSION_DENIED` result and a regression using the real `osascript` error 1002 sample.
