# Everything Search Integration for Windows

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
3. **Everything CLI**: Query is passed to `es.exe` with optimized parameters
4. **Result Parsing**: CLI output is parsed into TuffItems
5. **Scoring**: Results are scored based on recency and position
6. **Display**: Results are merged with other providers and displayed

### Fallback Behavior

- If Everything is not installed, the provider gracefully skips search
- File provider continues to work for indexing and metadata
- No errors or crashes occur when Everything is unavailable

## Configuration

### Environment Variables

You can customize the Everything CLI path:

```bash
# Set custom es.exe path (optional)
set EVERYTHING_CLI_PATH=C:\Custom\Path\es.exe
```

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
