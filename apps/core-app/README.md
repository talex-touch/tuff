# Tuff Core App

An Electron application with Vue 3 and TypeScript, featuring a unified download center and automatic update system.

## Features

- **Unified Download Center**: Centralized download management with progress tracking, pause/resume, and history
- **Automatic Updates**: Seamless application updates with download progress and verification
- **Plugin System**: Extensible architecture for custom capabilities
- **AI Integration**: Built-in AI-powered search and contextual intelligence
- **Performance Optimized**: Virtual scrolling, database indexes, and throttled updates

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## Architecture

### Main Process Modules

- **Download Center** (`src/main/modules/download/`): Unified download management system
  - Task queue with priority scheduling
  - Chunk-based downloading with resume support
  - Progress tracking and speed calculation
  - Database persistence with SQLite
  - Error logging and retry mechanisms
  - See [API Documentation](src/main/modules/download/API.md)

- **Update System** (`src/main/modules/update/`): Application update management
  - GitHub Releases integration
  - Automatic version detection
  - SHA256 checksum verification
  - Platform-specific installer handling
  - See [Update System README](src/main/modules/update/README.md)

- **Plugin System** (`src/main/modules/plugin/`): Plugin management and loading
- **Box Tool** (`src/main/modules/box-tool/`): Core search and command functionality
- **Database** (`src/main/modules/database/`): SQLite database management

### Renderer Process

- **Vue 3** with Composition API
- **TypeScript** for type safety
- **Element Plus** UI components
- **UnoCSS** for styling
- **Virtual scrolling** for performance

## Documentation

### Download Center

- [API Documentation](src/main/modules/download/API.md) - Complete API reference
- [Migration Guide](src/main/modules/download/MIGRATION_GUIDE.md) - Data migration from old systems
- [Performance Optimizations](src/main/modules/download/PERFORMANCE_OPTIMIZATIONS.md) - Performance details
- [Progress Tracker Usage](src/main/modules/download/PROGRESS_TRACKER_USAGE.md) - Progress tracking guide

### Update System

- [Update System README](src/main/modules/update/README.md) - Update system documentation

## Development

### Running Tests

```bash
$ pnpm test
```

### Code Quality

```bash
# Lint
$ pnpm lint

# Format
$ pnpm format
```

### Database Migrations

Database schema migrations are automatically applied on startup. To create a new migration:

1. Add migration to `src/main/modules/download/migrations.ts`
2. Increment version number
3. Implement `up()` and optionally `down()` methods
4. Test migration on development database

See [Migration Guide](src/main/modules/download/MIGRATION_GUIDE.md) for details.

## Performance

The application includes several performance optimizations:

- **Virtual Scrolling**: Handles 1000+ items smoothly
- **Database Indexes**: 5-10x faster queries
- **Progress Throttling**: Reduced IPC overhead
- **Task Caching**: Faster lookups
- **Debounced Search**: Smoother user input

See [Performance Optimizations](src/main/modules/download/PERFORMANCE_OPTIMIZATIONS.md) for details.

## Troubleshooting

### Download Issues

1. Check error logs: `download:get-logs` IPC channel
2. Review error statistics: `download:get-error-stats`
3. Verify network connectivity
4. Check disk space

### Update Issues

1. Check update settings in preferences
2. Verify GitHub API accessibility
3. Review update system logs
4. Try manual update check

### Migration Issues

1. Check migration status: `download:get-migration-status`
2. Review migration logs
3. Retry migration if needed
4. Contact support with logs

## Contributing

Please read [CONTRIBUTING.md](../../.github/docs/contribution/CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.
