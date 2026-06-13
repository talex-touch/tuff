# Contributing to TuffEx

Thank you for your interest in contributing to TuffEx! We welcome all forms of contributions, from bug reports and feature requests to code contributions and documentation improvements.

## 🌟 Ways to Contribute

### 🐛 Bug Reports
Found a bug? Help us improve by reporting it:
- Use our [Bug Report Template](https://github.com/talex-touch/tuff/issues/new)
- Provide clear reproduction steps
- Include environment details (OS, browser, Vue version)
- Add screenshots or videos if applicable

### 💡 Feature Requests
Have an idea for a new feature?
- Use our [Feature Request Template](https://github.com/talex-touch/tuff/issues/new)
- Describe the use case and expected behavior
- Consider the impact on existing functionality
- Discuss in [GitHub Discussions](https://github.com/talex-touch/tuff/discussions) first for major features

### 📝 Documentation
Help improve our documentation:
- Fix typos and grammatical errors
- Add missing examples or clarifications
- Translate documentation to other languages
- Improve API documentation

### 🔧 Code Contributions
Contribute to the codebase:
- Fix bugs and issues
- Implement new features
- Improve performance
- Add or improve tests
- Refactor code for better maintainability

## 🚀 Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:
- **Node.js** (v18.0.0 or higher)
- **pnpm** (v8.0.0 or higher, recommended)
- **Git**

### Development Setup

1. **Fork the repository**
   ```bash
   # Fork the repo on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/talex-touch.git
   cd talex-touch
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Start component watch build**
   ```bash
   # Watch the UI source package
   pnpm dev
   ```

4. **Preview documentation in Nexus**
   ```bash
   pnpm -C "../../apps/nexus" run dev
   ```

5. **Run tests**
   ```bash
   # Run all tests
   pnpm test
   
   # Run tests in watch mode
   pnpm test:watch
   
   # Generate coverage report
   pnpm test:coverage
   ```

### Project Structure

```
talex-touch/
├── packages/
│   ├── components/          # Component source code
│   │   ├── button/         # Individual component
│   │   ├── avatar/
│   │   └── ...
│   ├── theme/              # Theme system
│   ├── utils/              # Utility functions
│   └── tuffex/             # Main package entry
├── scripts/                # Package audit scripts
├── tests/                  # Test files
└── tools/                  # Development tools
```

## 📋 Development Guidelines

### Code Style

We use ESLint and Prettier to maintain consistent code style:

```bash
# Check code style
pnpm lint

# Auto-fix style issues
pnpm lint:fix

# Format code
pnpm format
```

**Key conventions:**
- Use TypeScript for all new code
- Follow Vue 3 Composition API patterns
- Use `<script setup>` syntax
- Prefer named exports over default exports
- Use kebab-case for component file names
- Use PascalCase for component names

### Commit Messages

We follow [Conventional Commits](https://conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(button): add ripple animation effect
fix(avatar): resolve image loading issue
docs: update installation guide
test(slider): add unit tests for touch events
```

### Component Development

When creating a new component:

1. **Create component directory**
   ```
   packages/components/your-component/
   ├── src/
   │   ├── your-component.vue
   │   ├── your-component.ts
   │   └── types.ts
   ├── style/
   │   └── index.scss
   ├── __tests__/
   │   └── your-component.test.ts
   └── index.ts
   ```

2. **Follow naming conventions**
   - Component name: `TxYourComponent`
   - File name: `your-component.vue`
   - Props interface: `YourComponentProps`

3. **Include proper TypeScript types**
   ```typescript
   export interface YourComponentProps {
     size?: 'small' | 'medium' | 'large'
     disabled?: boolean
     // ... other props
   }
   ```

4. **Add comprehensive tests**
   ```typescript
   import { mount } from '@vue/test-utils'
   import YourComponent from '../src/your-component.vue'
   
   describe('YourComponent', () => {
     it('should render correctly', () => {
       const wrapper = mount(YourComponent)
       expect(wrapper.exists()).toBe(true)
     })
   })
   ```

5. **Document the component**
   - Add JSDoc comments for props and methods
   - Update the Nexus TuffEx docs/showcase when public usage changes
   - Include usage examples in the Nexus content source

### Testing

We use Vitest for unit testing:

**Test file naming:**
- Unit tests: `*.test.ts`
- Component tests: `*.spec.ts`

**Testing guidelines:**
- Write tests for all new features
- Maintain or improve test coverage
- Test both happy path and edge cases
- Mock external dependencies
- Use descriptive test names

### Animation Guidelines

TuffEx focuses on smooth, meaningful animations:

**Performance:**
- Use `transform` and `opacity` for animations
- Avoid animating layout properties
- Use `will-change` sparingly
- Prefer CSS animations over JavaScript when possible

**Timing:**
- Use consistent easing curves
- Default duration: 200-300ms for micro-interactions
- Longer durations (400-600ms) for complex transitions
- Respect `prefers-reduced-motion` setting

**Implementation:**
```scss
.tx-component {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    transform: translateY(-2px);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
}
```

## 🔄 Pull Request Process

### Before Submitting

1. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes**
   - Follow the coding guidelines
   - Add tests for new functionality
   - Update documentation if needed

3. **Test your changes**
   ```bash
   # Run all tests
   pnpm test

   # Check types
   pnpm typecheck

   # Lint code
   pnpm lint

   # Build the project
   pnpm build
   ```

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "feat(component): add new feature"
   ```

### Submitting the PR

1. **Push to your fork**
   ```bash
   git push origin feat/your-feature-name
   ```

2. **Create Pull Request**
   - Use our [PR template](https://github.com/talex-touch/tuff/tree/master/.github/PULL_REQUEST_TEMPLATE)
   - Provide clear description of changes
   - Link related issues
   - Add screenshots for UI changes
   - Mark as draft if work in progress

3. **PR Requirements**
   - ✅ All tests pass
   - ✅ Code coverage maintained or improved
   - ✅ No TypeScript errors
   - ✅ Documentation updated
   - ✅ Follows coding standards

### Review Process

1. **Automated Checks**
   - CI/CD pipeline runs tests
   - Code quality checks
   - Build verification

2. **Code Review**
   - At least one maintainer review required
   - Address feedback promptly
   - Keep discussions constructive

3. **Merge**
   - Squash and merge for feature branches
   - Maintain clean commit history

## 🏗️ Release Process

### Versioning

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Workflow

1. **Automated Releases**
   - Publishing to npm is triggered by a version bump in `packages/tuffex/package.json` on `main`
   - The publish workflow builds the package before releasing

2. **Manual Release Steps** (for maintainers)
   ```bash
   # Update version (semver)
   # Edit packages/tuffex/package.json

   # Build
   pnpm -C packages/tuffex run build

   # Publish (fallback)
   cd packages/tuffex && npm publish --access public
   ```

## 🎯 Component Design Principles

### Accessibility First
- Follow WCAG 2.1 AA guidelines
- Support keyboard navigation
- Provide proper ARIA attributes
- Test with screen readers

### Performance Focused
- Minimize bundle size impact
- Optimize for tree shaking
- Use efficient rendering patterns
- Profile animation performance

### Developer Experience
- Intuitive API design
- Comprehensive TypeScript support
- Clear error messages
- Extensive documentation

### Design System Consistency
- Follow design tokens
- Maintain visual consistency
- Support theming
- Responsive by default

## 🤝 Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive environment. Please read our [Code of Conduct](CODE_OF_CONDUCT.md).

### Communication

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and ideas
- **Discord**: Real-time community chat
- **Email**: security@talex.cn for security issues

### Recognition

Contributors are recognized in:
- README contributors section
- Release notes
- Annual contributor highlights
- Special badges for significant contributions

## 📚 Resources

### Documentation
- [Component API Reference](https://tuffex.tagzxia.com/docs/dev/tuffex/components)
- [Design Guidelines](https://tuffex.tagzxia.com/docs/dev/tuffex/design)
- [Theme Customization](https://tuffex.tagzxia.com/docs/dev/tuffex/guide/theming)

### Development Tools
- [VSCode Extension](https://marketplace.visualstudio.com/items?itemName=talex-touch.touchx-ui)
- [Figma Design Kit](https://figma.com/@touchx-ui)
- [CLI Tool](https://www.npmjs.com/package/@talex-touch/touchx-cli)

### Learning Resources
- [Vue 3 Documentation](https://vuejs.org/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)

## ❓ Getting Help

Need help? Here's how to get support:

1. **Check existing resources**
   - Search [GitHub Issues](https://github.com/talex-touch/tuff/issues)
   - Browse [Documentation](https://tuffex.tagzxia.com/docs/dev/tuffex)
   - Read [FAQ](https://tuffex.tagzxia.com/docs/dev/tuffex/guide/faq)

2. **Ask the community**
   - [GitHub Discussions](https://github.com/talex-touch/tuff/discussions)
   - [Discord Server](https://discord.gg/touchx-ui)

3. **Report issues**
   - Use appropriate issue templates
   - Provide minimal reproduction
   - Include environment details

---

Thank you for contributing to TuffEx! Together, we're building the future of tactile web interfaces.
