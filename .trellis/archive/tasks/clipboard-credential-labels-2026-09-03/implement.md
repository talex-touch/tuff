# Implementation — Clipboard credential and software labels

1. Extend the shared detector with precise credential formats, explicit WeChat references, and a canonical metadata search-term projection.
2. Persist tag aliases in clipboard capture, and merge both tags and aliases from OCR completion without overwriting retained metadata.
3. Remove the forced English OCR hint for new clipboard image/file jobs so native OCR resolves system/profile languages; preserve explicit historical job hints.
4. Add Clipboard History labels for WeChat and all credential classifications.
5. Run focused tests, CoreApp node typecheck, plugin typecheck/build/validation, and whitespace validation.
