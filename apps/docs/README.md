# Tuff - Docs

## 💬 Introduction

Tuff is a local-first, AI-powered productivity tool. It's built with Electron and Vue 3, and designed to be your second brain.

This documentation is built with [Vitepress](https://vitepress.vuejs.org).

> Auto build - Tuff Document.

## 🌟 Core Features

- **Local-First AI**: All AI computations, from semantic search to data analysis, happen on your device. Your data remains private.
- **Contextual Intelligence**: Tuff understands your context by tapping into OS-level APIs and building a local knowledge graph.
- **Sandboxed Plugins**: Our plugin system, built on a sandboxed architecture, allows for safe and powerful extensions to the core functionality.
- **Extensible**: Bring your own self-hosted or private LLMs to customize Tuff to your needs.
- **Cross-Platform**: Currently in Public Beta for Windows, macOS, and Linux.

## 🚀 Getting Started

### Prerequisites

- Node.js >= 22.0.0
- pnpm (recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/tuff/tuff.git

# Navigate to the docs directory
cd apps/docs

# Install dependencies
pnpm install

# Start the development server
pnpm dev
```

### Building

```bash
# Build the documentation
pnpm build
```

## 📚 Documentation Structure

The documentation is organized into several sections:

- **Documents**: Introduction, getting started, and account management.
- **Plugin Extensions**: Guides for extending Tuff with new extensions.
- **Plugins**: In-depth guides for developing plugins.
- **Q & A**: Frequently asked questions and troubleshooting.
- **About**: Changelog and team information.

## 🤝 Contributing

We welcome contributions to improve Tuff and its documentation. Please read our contributing guidelines before submitting pull requests.

## 📄 License

Tuff is released under the MIT License. See the [LICENSE](https://github.com/tuff/tuff/blob/main/LICENSE) file for details.
