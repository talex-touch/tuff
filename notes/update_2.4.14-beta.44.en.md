# Tuff v2.4.14-beta.44 Release Notes

## Summary Notes

- The on-device ASR binding is released before the disabled and user-closed checks: an empty model store no longer leaves a binding naming a model that was just removed, so switching the route back on in the same session cannot point `audio.asr` at weights that are gone.
- TuffEx stops shipping a second copy of the markdown sheet: `stream-markdown` declares a style dependency and borrows `markdown-view`'s stylesheet, taking that entry from 51.3 KiB to 12.3 KiB and the on-demand set from 624.7 KiB to 585.8 KiB.
- The 39.0 KiB this round removed was duplicated rules, so the full-bundle CSS limit moves to 618 KiB (measured 615.9 KiB), and the 09-26 note records which waste that limit exists to catch.
- Two factual corrections in the Cloudflare AI Gateway report: BYOK is in fact documented, and `cf-aig-cache-key` replaces the default key rather than adding a dimension.
- This beta catches the testers' channel up to `master` before it is cut, which is what finally puts what landed after beta.43 into their build.

## What's Changed

- Binding order: an empty model store used to return after the `enabled === false` and user-disabled checks, so a disabled provider kept a binding naming a model the user had just removed, and re-enabling the channel in the same session pointed `audio.asr` at weights that are gone. The release now runs before those checks; the preference lives on `stored.providers`, which the release does not touch, so both the disabled flag and the user-disabled marker survive it.
- TuffEx style dependency: `stream-markdown` renders `.markdown-body` too and used to import the vendored GitHub sheet straight out of `markdown-view`'s directory, so the per-entry CSS split emitted a full second copy into `stream-markdown/style.css` (39.0 KiB of byte-identical rules). The rules now stay in `markdown-view`'s sheet and arrive through a declared style dependency; both roots carry `.tx-md`, so scoping is unchanged, and `style-deps.json` gains `stream-markdown -> markdown-view`.
- Bundle budget: three components shipped sheets in this round (`prism-glow` 4.9 KiB, `choice-card` 3.9 KiB, `fusion-surface` 0.7 KiB) and the copy above removed 39.0 KiB, leaving the full bundle at 615.9 KiB, so the limit was raised to 618 KiB.
- Docs: in the Cloudflare AI Gateway report, the Custom Providers page's Best practices #6 recommends BYOK, so the claim that BYOK support is undocumented was wrong; `cf-aig-cache-key` replaces the default cache key rather than adding a dimension; the dynamic-routing REST page is named; and the gateway-history line now separates repo evidence from what only the dashboard can settle.
- Channel: this beta merges `origin/master` before it is cut, so the four commits above (`fc4ab9a0a`, `f775a3adc`, `8a707d179`, `139c92098`) travel into the beta channel with this build and `master` no longer runs ahead of what testers have.
