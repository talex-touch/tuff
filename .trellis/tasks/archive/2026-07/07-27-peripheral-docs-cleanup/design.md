# Design: peripheral product documentation repair

## 1. Scope projection

Build the source set from Git-tracked `*.md` and `*.mdc` files. Include product-facing root/package/app/docs content, then apply explicit exclusions for:

- agent/platform instruction directories;
- `.trellis/` internals and archives;
- runtime/cache/generated/build/dependency trees;
- `.pen` and binary assets as source documents;
- raw or immutable evidence payloads;
- `README.md` and `README.zh-CN.md` owned by Batch B;
- concurrent bilingual/What's Changed paths.

The PR records the final filters so Batch D can reproduce them rather than reverse-engineer the cleanup.

## 2. Link resolution model

Use a Markdown AST and inspect inline link/image nodes. For a candidate relative URL:

1. reject unsupported/unsafe URL syntax as a finding;
2. skip external schemes and fragment-only references;
3. percent-decode the pathname and remove query/fragment for filesystem lookup;
4. resolve relative to the source document;
5. normalize and ensure the target remains inside the repository;
6. accept a tracked file, or a tracked directory index according to existing repository conventions;
7. report source, line/column, original URL, and resolved missing target.

No network requests are made. Anchor validity is reported separately and is not invented as a path-existence result unless the existing parser can resolve headings deterministically.

## 3. Repair decision tree

- If the intended document moved, update to its canonical tracked path.
- If the intended information now lives in a maintained index, link to that exact section/page.
- If no maintained destination exists, remove the link and any promise that the missing page fulfills.
- If ownership belongs to Batch B or another concurrent task, record the finding and leave the path untouched.

This avoids placeholder pages and false-positive "fixes" that preserve misleading prose.

## 4. Named document contracts

| Surface | Refresh focus |
| --- | --- |
| CoreApp README | current package role, commands, canonical architecture/docs links |
| Search Engine README | actual search/index ownership, current architecture, explicit unfinished split boundary |
| Nexus release/download docs | maintained release/download routes, indexes, and bilingual navigation |
| DivisionBox example README | real setup, source/assets, and example paths |
| Download API EN/ZH | route and concept parity, canonical related docs |
| TuffEx CONTRIBUTING | current workspace commands, package paths, and contribution guidance |

Behavioral claims are verified against existing source/config but production code is not modified.

## 5. Validation handoff to Batch D

Batch C supplies:

- exact include/exclude scope;
- parser/resolution behavior;
- before/after finding counts;
- any deliberately deferred anchor or external-link classes;
- false-positive examples that need focused fixtures.

Batch D turns that research into the permanent local/CI entrypoint after all documentation PRs are available.

## 6. Rollback

The PR is documentation-only and can be reverted as one scoped commit. If a canonical target later moves, fix the owning page or revert the individual link; never restore a known-broken target merely to preserve old wording.
