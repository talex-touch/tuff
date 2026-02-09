# Everything Search Integration for Windows

## Scope

- Windows-only integration of Everything (es.exe) as a file search provider.

## Summary

- Goal: sub-50ms file search using Everything index.
- Backend strategy: prefer native SDK (N-API), fallback to Everything CLI (`es.exe`) when SDK is unavailable.

## References

- Docs Index: `docs/INDEX.md`

## Rollout Status

- 最新落地状态与待办统一见：`docs/engineering/everything-sdk-rollout-status.md`
- 当前实现：SDK（N-API）优先，失败自动回退 CLI（`es.exe`）
- 发布前必须补齐：Windows 真机自检与结果留档

## Documentation Ownership

- Core 技术细节（安装、架构、排障）统一维护在本文。
- Nexus 文档只保留视角差异与入口，详见：`docs/nexus-everything-integration.md`。
- 状态与执行进度统一维护在：`docs/engineering/everything-sdk-rollout-status.md`。

## Overview

Tuff now integrates with [Everything](https://www.voidtools.com/) search engine on Windows for ultra-fast file searching. Everything provides instant file search results by maintaining a real-time index of all files on NTFS volumes.

## Features

- **Instant Search**: Sub-50ms search response time
- **Real-time Index**: Everything maintains its own real-time file index
- **Low Resource Usage**: Minimal CPU and memory footprint
- **NTFS Integration**: Leverages NTFS USN Journal for instant updates
- **Powerful Syntax**: Support for wildcards, regex, and advanced filters

## Installation

### 1. Install Everything

1. Download Everything from [https://www.voidtools.com/](https://www.voidtools.com/)
2. Run the installer and complete the setup
3. Launch Everything to ensure it's running

### 2. Install Everything Command-line Interface (es.exe)

1. Download the Everything Command-line Interface from [https://www.voidtools.com/support/everything/command_line_interface/](https://www.voidtools.com/support/everything/command_line_interface/)
2. Extract `es.exe` to one of the following locations:
   - Everything installation directory (e.g., `C:\Program Files\Everything\`)
   - A directory in your system PATH
   - `%LOCALAPPDATA%\Programs\Everything\`

### 3. Verify Installation

Open Command Prompt and run:
```cmd
es.exe -v
```

You should see the Everything CLI version information.

## Usage

### Basic Search

Simply type your search query in Tuff's CoreBox:

```
document.pdf
```

### Advanced Search Syntax

Everything supports powerful search syntax:

#### Wildcards
- `*.txt` - All text files
- `file?.doc` - Matches file1.doc, file2.doc, etc.

#### Boolean Operators
- `photo AND vacation` - Files containing both terms
- `report OR summary` - Files containing either term
- `document NOT draft` - Files with "document" but not "draft"

#### Filters
- `ext:pdf` - All PDF files
- `size:>10mb` - Files larger than 10MB
- `dm:today` - Files modified today
- `dc:lastweek` - Files created last week

#### Exact Phrases
- `"project proposal"` - Exact phrase match

### Provider Filter

Use the `@file` or `@everything` prefix to search only with Everything:

```
@file presentation.pptx
@everything *.jpg
```

## Architecture

### Provider Priority

On Windows, the Everything provider is registered with **fast** priority, ensuring it returns results in the first batch alongside applications and system commands.

```typescript
readonly priority = 'fast' as const
readonly expectedDuration = 50 // milliseconds
```

### Integration Flow

1. **Search Request**: User enters query in CoreBox
2. **Provider Selection**: Everything provider is invoked for Windows platform
3. **Backend Resolve**: provider tries SDK (`sdk-napi`) first, then falls back to CLI (`es.exe`)
4. **Backend Query**: active backend executes the query with optimized parameters
5. **Result Parsing**: backend output is normalized into TuffItems
6. **Scoring**: results are scored based on recency and position
7. **Display**: results are merged with other providers and displayed

### Fallback Behavior

- Default fallback chain: `sdk-napi -> cli -> unavailable`
- If SDK fails at runtime, provider auto-falls back to CLI in the same request lifecycle
- If both backends are unavailable, provider gracefully skips search (no crash)
- File provider still handles indexing and metadata as a safety net

## Configuration

### Environment Variables

You can override SDK addon discovery path:

```bash
# Optional: custom native addon path
set TALEX_EVERYTHING_SDK_PATH=C:\path\to\everything.node
```

### Runtime Status Fields

`everything:status` now returns backend diagnostics:

- `backend`: current active backend (`sdk-napi` | `cli` | `unavailable`)
- `fallbackChain`: backend downgrade order
- `lastBackendError`: latest backend initialization/search error
- `version`: SDK/CLI version when available

`everything:test` also returns `backend` to indicate which backend handled the probe query.

### SDK Self-check (Windows)

Use the native package self-check script to verify SDK availability and query flow:

```bash
pnpm -C "packages/tuff-native" run check:everything -- --query "*.txt" --max 10
```

Expected output is a JSON summary with:

- `ok`: whether SDK query succeeded
- `version`: Everything SDK version (or `null` if unavailable)
- `resultCount`: number of results returned
- `sample`: first normalized result (when available)

### Search Limits

Default maximum results: **50 files**

This can be adjusted in the provider configuration:

```typescript
// In everything-provider.ts
private async searchEverything(query: string, maxResults = 50)
```

## Performance

### Benchmarks

| Operation | Time |
|-----------|------|
| Search initialization | < 5ms |
| Search execution | 20-50ms |
| Result parsing | < 5ms |
| Total response time | **< 60ms** |

### Comparison

| Provider | Platform | Index Time | Search Time | Memory |
|----------|----------|------------|-------------|--------|
| Everything | Windows | 0s (real-time) | 20-50ms | ~10MB |
| File Provider | macOS/Linux | 5-30min | 100-500ms | ~50MB |

## Troubleshooting

### Everything CLI Not Found

**Error**: `Everything Command-line Interface (es.exe) not found`

**Solutions**:
1. Verify `es.exe` is installed
2. Check if `es.exe` is in system PATH
3. Run `es.exe -v` in Command Prompt to verify
4. Reinstall Everything CLI to default location

### No Search Results

**Possible Causes**:
1. Everything service is not running
   - Open Everything application
   - Check system tray for Everything icon
2. NTFS volumes not indexed
   - Open Everything → Tools → Options → Indexes
   - Ensure your drives are selected
3. Query syntax error
   - Try simpler queries first
   - Check Everything documentation for syntax

### Slow Search Performance

**Solutions**:
1. Update Everything to latest version
2. Rebuild Everything index: Tools → Options → Indexes → Rebuild
3. Exclude network drives if not needed
4. Check for disk I/O issues

## Development

### Adding Custom Filters

Extend the `buildEverythingQuery` method in `everything-provider.ts`:

```typescript
private buildEverythingQuery(searchText: string): string {
  // Add custom filter logic
  if (searchText.startsWith('recent:')) {
    const days = parseInt(searchText.split(':')[1]) || 7
    return `dm:last${days}days`
  }
  
  return searchText
}
```

### Custom Result Scoring

Modify the scoring algorithm in `onSearch`:

```typescript
const recencyScore = Math.exp(-0.05 * daysSinceModified)
const positionScore = 1 - (index / results.length) * 0.5
const finalScore = recencyScore * 0.6 + positionScore * 0.4
```

## API Reference

### EverythingProvider Class

#### Properties

- `id`: `'everything-provider'` - Unique provider identifier
- `name`: `'Everything Search'` - Display name
- `type`: `'file'` - Provider type
- `priority`: `'fast'` - Search priority layer
- `expectedDuration`: `50` - Expected search duration in ms

#### Methods

- `onLoad(context)`: Initialize provider and detect Everything CLI
- `onSearch(query, signal)`: Execute search and return results
- `onExecute(args)`: Open selected file

### Everything CLI Parameters

Default parameters used:

```bash
es.exe <query> -n 50 -s path -path -size -dm -dc
```

- `-n 50`: Maximum 50 results
- `-s path`: Sort by path
- `-path`: Show full path
- `-size`: Show file size
- `-dm`: Show date modified
- `-dc`: Show date created

## Resources

- [Everything Homepage](https://www.voidtools.com/)
- [Everything CLI Documentation](https://www.voidtools.com/support/everything/command_line_interface/)
- [Everything Search Syntax](https://www.voidtools.com/support/everything/searching/)
- [Everything SDK](https://www.voidtools.com/support/everything/sdk/)

## Future Enhancements

### Planned Features

1. **Everything SDK Integration**: Direct API integration for even faster searches
2. **Custom File Icons**: Extract and cache file icons from Everything
3. **Advanced Filters UI**: Visual filter builder for complex queries
4. **Search History**: Remember and suggest previous Everything searches
5. **Network Drive Support**: Optional indexing of network locations

### Community Contributions

Contributions are welcome! Areas for improvement:

- Better error handling and user feedback
- Support for Everything bookmarks
- Integration with Everything filters
- Custom result templates
- Performance optimizations

## License

Everything is developed by voidtools and is free for personal and commercial use.

Tuff's Everything integration is part of the Tuff project and follows the same license.
