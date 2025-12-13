# TouchX UI Playground

<p align="center">
  <img src="public/touchx-logo-transparent.png" width="120" height="120" alt="TouchX UI Logo">
</p>

<p align="center">
  <strong>🎭 Interactive Component Testing Environment</strong>
</p>

A development playground for testing and experimenting with TouchX UI components. This environment provides a sandbox for component development, testing, and demonstration.

## 🚀 Quick Start

```bash
# Install dependencies (from project root)
pnpm install

# Start playground development server
pnpm comp:play

# Or run from playground directory
cd playground/vue-vite-playground
pnpm dev
```

## 🎯 Purpose

This playground serves multiple purposes:

- **Component Development** - Test new components in isolation
- **Interactive Testing** - Experiment with component props and behaviors
- **Visual Debugging** - Debug animations and visual effects
- **Demo Creation** - Create examples for documentation
- **Performance Testing** - Test component performance under various conditions

## 🛠️ Development

### Adding New Components

1. Import the component in `src/main.ts` or component files
2. Create test cases in `src/components/` or `src/views/`
3. Add routing if needed in `src/router/`

### Testing Animations

The playground is optimized for testing TouchX UI's signature animations:
- Use browser dev tools to inspect animation performance
- Test on different devices and screen sizes
- Verify `prefers-reduced-motion` support

### IDE Setup

Recommended development setup:
- **VS Code** with Volar extension
- **Vue Language Features (Volar)** for Vue 3 support
- **TypeScript Vue Plugin** for enhanced TypeScript support

## 📁 Structure

```
playground/vue-vite-playground/
├── public/                 # Static assets
│   ├── touchx-logo.png    # TouchX UI logo
│   └── touchx-logo-transparent.png
├── src/
│   ├── components/        # Test components
│   ├── views/            # Test pages
│   ├── App.vue           # Main app component
│   └── main.ts           # App entry point
├── index.html            # HTML template
└── vite.config.ts        # Vite configuration
```

## 🔗 Related

- [TouchX UI Documentation](https://touchx-ui.talex.cn)
- [Component Development Guide](../../CONTRIBUTING.md)
- [Main Repository](../../README.md)
