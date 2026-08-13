# Web search tool for home chat (blocked on backend decision)

## Problem

"自带联网" never existed: the tool gateway has no web tool (11 tools, all local/render/MCP), and
installed pi 0.84.0 ships no built-in web search (verified in its dist — nothing to enable).
`tuff_search_files` is the local CoreBox index and easily mistaken for web search.

## Proposed shape (once unblocked)

- Gateway tool `tuff_web_search(query, count?)` returning title/url/snippet list, plus reuse of
  page-fetch extraction for follow-up reads; forwarder added to `packages/pi-extension-tuff`;
  tools system prompt extended so the model knows when to search (dates/news/facts → search
  first).
- Provider-agnostic: lives in tool-gateway, so any future provider inherits it.

## Backend options (decision needed — user input)

| Option | Cost | Quality | Notes |
|---|---|---|---|
| A. DuckDuckGo HTML/lite scrape | free, no key | ok | zero-config default; brittle to markup changes |
| B. User-keyed API (Tavily/Brave/Bing) | key required | good | settings UI for key; best answer quality |
| C. Engine-URL + `browser.extract`-style fetch | free | poor | constructs result-page URL then extracts; fragile, CAPTCHA-prone |
| D. A default + B as configurable upgrade | — | — | recommended |

## Acceptance Criteria (draft)

- [ ] With the tool granted, "今天有什么新闻" triggers `tuff_web_search` and cites results.
- [ ] Search failures degrade to a normal tool-error card, never a hung turn.
- [ ] No network call unless the tool is invoked; respects the permission capsule (tool gating).
