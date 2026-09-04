# Clipboard credential and software labels

## Goal

Classify clipboard text and copy-source applications using the existing application semantic catalog; make classifications searchable and visible in Clipboard History; route image OCR by the Talex Touch app language before the operating-system language.

## Requirements

- Keep one local credential/software classifier. No network lookup or credential validation.
- Preserve precise credential detection and software aliases in copied text.
- Reuse the existing application semantic catalog for every detected source application rather than maintaining a second Clipboard-only list. Persist source aliases in metadata so the existing string query reaches all catalogued applications and their aliases.
- OCR priority is Talex Touch's active locale (`zh-CN` → `zh-Hans`, `en-US` → `en-US`); no valid app locale means no hint, allowing platform OCR to select its user/system behavior.
- Keep explicit language hints from historical persisted OCR jobs unchanged.
- Persist only category names, aliases, and locale identifiers; never copy credentials into metadata or logs.

## Acceptance Criteria

- [ ] Clipboard source metadata stores the existing catalog's aliases for a matched source application, and Clipboard History keyword search reaches them through metadata.
- [ ] Text `@wx`, `@wechat`, and `微信` classify consistently with source-app aliases.
- [ ] New OCR jobs translate the Talex Touch app locale to native Vision/WinRT locale hints; no app locale leaves selection to the OS.
- [ ] OCR tag and alias enrichment remains merge-safe.
- [ ] Focused tests, CoreApp node typecheck, plugin build/validation pass.

## Notes

- Clipboard already records the active source app and queries metadata by keyword. The new source alias projection connects that durable source-app identity to the catalog already used by application search.
