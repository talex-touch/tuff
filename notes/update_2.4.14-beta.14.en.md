# Tuff v2.4.14-beta.14 Release Notes

## Summary Notes

- CoreBox grid navigation now matches the rendered column count, including arrow movement in a single section with an overridden column count.
- Tray and Dock visibility now refresh promptly for lifecycle changes in every non-main window.
- Agent, plugin, and settings surfaces receive accessible empty-state and bilingual copy refinements.

## What's Changed

- Fixed hidden or destroyed DivisionBox sessions incorrectly keeping the Dock visible.
- Standardized TuffEx layout and scrolling behavior across agent details, plugin empty states, and settings pages.
- Added a shared grid-column resolver and regression coverage so rendered geometry and keyboard targeting cannot diverge again.
