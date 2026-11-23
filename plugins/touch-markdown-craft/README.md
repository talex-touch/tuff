# Touch Markdown Craft (`touch-markdown-craft`)

Offline Markdown power workbench for Tuff CoreBox.

## Features

- **CSV / TSV / JSON-Array -> Aligned GFM Table Generator**: Parses RFC-4180 CSV, TSV, and JSON arrays of objects into cleanly padded GitHub Flavored Markdown tables with CJK full-width column alignment, automatic right-alignment for numeric columns, pipe/newline escaping, and compact table export.
- **Shields.io Badge Builder**: Build Markdown badges, HTML `<img>` tags, and raw SVG URLs from `badge <label> | <message> | <color>` or shorthand `badge Build passing brightgreen style=for-the-badge logo=github`, plus curated quick presets.
- **Markdown TOC & GitHub Anchor Slug Extractor**: Extracts ATX headings while skipping fenced code blocks, computes GitHub-compatible CJK/Unicode anchor slugs with duplicate `-1`/`-2` suffixes, and emits nested TOC lists.
- **CJK-Aware Word, Character, Reading-Time & LLM-Token Estimator**: Counts CJK ideographs and Latin words separately, calculates UTF-8 bytes and dual-script reading time (~300 CJK chars/min + ~220 Latin words/min), and provides practical BPE LLM token estimates.
- **Code-Fence Wrapper**: Wraps pasted snippets with automatic language detection (`json`, `ts`, `sql`, `bash`, `html`, `css`, `python`, `yaml`) and dynamic backtick sizing when the snippet itself contains triple backticks.
- **Markdown-to-Plain-Text Stripper**: Cleanly removes Markdown headings, emphasis, inline code, links, images, blockquotes, lists, tables, and HTML tags into readable plain text.

## Commands

Activate via `md`, `markdown`, `mdtable`, `badge`, `mdtoc`, `mdcraft`, `表格生成`, or `徽章生成`:

- `md Name,Role,Score\nAlice,Engineer,98\nBob,Designer,94`
- `md [{"pkg":"tuff","stars":1200},{"pkg":"tuffex","stars":480}]`
- `md badge Build | passing | brightgreen`
- `md badge License MIT blue style=flat-square`
- `md toc # Intro\n## 快速开始\n### Installation`
- `md fence ts const ok: boolean = true`
- `md strip **Hello** [Tuff](https://tuff.tagzxia.com) \`code\``
- `md stats 你好世界 Hello Tuff Markdown workbench`

## Permissions

- `clipboard.write` (optional): Copy generated Markdown outputs to the clipboard, enforced fail-closed at execution time.

## Testing

```bash
node -c index.js && node --test index.test.cjs
```
