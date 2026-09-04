# Tuff v2.4.14-beta.19 Release Notes

## Summary Notes

- Clipboard History now clears the CoreBox input after an alias opens the manager, so the trigger text no longer interferes with history content.
- Selecting an image now upgrades the preview from its thumbnail to the available original while preserving OCR status, language, confidence, and recognized text.
- Switch and Checkbox now provide loading states that block repeated input during asynchronous confirmation while preserving the current value semantics.
- Switch now supports built-in labels, label placement, and animated text changes without requiring callers to assemble adjacent label markup.
- Nexus component suite overviews now list every component by category and stay synchronized with component documentation.
- Nexus component preview bars now separate the install command from the version badge and highlight the current version with an accessible green treatment.

## What's Changed

- Fixed the stale Clipboard History alias in CoreBox; users can enter a fresh history query immediately after the manager opens.
- Fixed `tfile:` originals in isolated plugin views; a labeled thumbnail fallback appears only when the original genuinely fails to load.
- Kept image OCR details visible and copyable, including final OCR status, language, confidence, recognized text, and keywords.
- Switch and Checkbox loading states block interaction and expose busy semantics to assistive technology.
- Switch built-in labels support either side of the control, animate text changes, and retain arbitrary default-slot content.
- Nexus suite pages replace drift-prone hand-written samples with the same complete categorized catalog used by the sidebar.
- Refined the component gallery preview bar: the install command anchors left, the version badge anchors right, and the success tint mixes with theme text color to remain readable in light and dark modes.
