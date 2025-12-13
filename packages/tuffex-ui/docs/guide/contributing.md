# Contributing

We're thrilled that you're interested in contributing to TouchX UI! This guide will help you get started with contributing to our design system, whether you're fixing bugs, adding features, improving documentation, or helping with translations.

## Ways to Contribute

### 🐛 Bug Reports
Help us improve by reporting issues you encounter:
- Use our [issue template](https://github.com/talex-touch/touchx-ui/issues/new?template=bug_report.md)
- Include reproduction steps and environment details
- Provide screenshots or videos when helpful

### ✨ Feature Requests
Suggest new components or enhancements:
- Check existing [feature requests](https://github.com/talex-touch/touchx-ui/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)
- Use our [feature request template](https://github.com/talex-touch/touchx-ui/issues/new?template=feature_request.md)
- Explain the use case and expected behavior

### 📝 Documentation
Improve our docs and examples:
- Fix typos and clarify explanations
- Add missing examples or use cases
- Translate documentation to other languages
- Create tutorials and guides

### 🎨 Design Contributions
Help evolve our design system:
- Propose new design patterns
- Improve accessibility and usability
- Create new icons or illustrations
- Suggest color palette improvements

## Getting Started

### Development Setup

1. **Fork and clone the repository**:
```bash
git clone https://github.com/YOUR_USERNAME/touchx-ui.git
cd touchx-ui
```

2. **Install dependencies**:
```bash
pnpm install
```

3. **Start the development environment**:
```bash
# Start component playground
pnpm dev

# Start documentation site
pnpm docs:dev

# Run tests
pnpm test
```

### Project Structure

```
touchx-ui/
├── packages/
│   ├── components/          # Vue components
│   ├── theme/              # Design tokens and styles
│   ├── utils/              # Utility functions
│   └── icons/              # Icon components
├── docs/                   # Documentation site
├── playground/             # Component development environment
├── tests/                  # Test files
└── scripts/               # Build and development scripts
```

## Development Workflow

### Creating a New Component

1. **Plan the component**:
   - Review existing patterns and design tokens
   - Create or reference design specifications
   - Consider accessibility requirements
   - Plan API design and prop structure

2. **Generate component scaffold**:
```bash
pnpm create:component ComponentName
```

3. **Implement the component**:
```vue
<!-- packages/components/src/component-name/ComponentName.vue -->
<template>
  <div 
    class="tx-component-name"
    :class="componentClasses"
    v-bind="$attrs"
  >
    <slot />
  </div>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  disabled: false
})

const componentClasses = computed(() => [
  `tx-component-name--${props.variant}`,
  `tx-component-name--${props.size}`,
  {
    'tx-component-name--disabled': props.disabled
  }
])
</script>
```

4. **Add styles**:
```scss
// packages/components/src/component-name/style/index.scss
.tx-component-name {
  // Use design tokens
  padding: var(--tx-space-4);
  border-radius: var(--tx-radius-md);
  background: var(--tx-color-surface);
  
  // Variants
  &--primary {
    background: var(--tx-color-primary);
    color: white;
  }
  
  &--secondary {
    background: var(--tx-color-secondary);
    color: var(--tx-text-primary);
  }
  
  // Sizes
  &--sm {
    padding: var(--tx-space-2) var(--tx-space-3);
    font-size: var(--tx-text-sm);
  }
  
  &--lg {
    padding: var(--tx-space-6) var(--tx-space-8);
    font-size: var(--tx-text-lg);
  }
  
  // States
  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
```

5. **Write tests**:
```typescript
// packages/components/src/component-name/__tests__/ComponentName.test.ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ComponentName from '../ComponentName.vue'

describe('ComponentName', () => {
  it('renders correctly', () => {
    const wrapper = mount(ComponentName, {
      props: { variant: 'primary' }
    })
    
    expect(wrapper.classes()).toContain('tx-component-name--primary')
  })
  
  it('handles disabled state', () => {
    const wrapper = mount(ComponentName, {
      props: { disabled: true }
    })
    
    expect(wrapper.classes()).toContain('tx-component-name--disabled')
  })
})
```

6. **Add documentation**:
```markdown
<!-- docs/components/component-name.md -->
# ComponentName

Brief description of the component and its purpose.

## Basic Usage

\`\`\`vue
<template>
  <TxComponentName variant="primary">
    Content goes here
  </TxComponentName>
</template>
\`\`\`

## API

### Props

| Name | Type | Default | Description |
|------|------|---------|-------------|
| variant | `'primary' \| 'secondary'` | `'primary'` | Visual variant |
| size | `'sm' \| 'md' \| 'lg'` | `'md'` | Component size |
| disabled | `boolean` | `false` | Disable the component |

### Events

| Name | Parameters | Description |
|------|------------|-------------|
| click | `(event: MouseEvent)` | Emitted when clicked |

### Slots

| Name | Description |
|------|-------------|
| default | Main content |
```

### Code Quality Standards

#### TypeScript
- Use strict TypeScript configuration
- Define proper interfaces for props and events
- Avoid `any` types - use proper typing
- Export types for external use

#### Vue Best Practices
- Use Composition API with `<script setup>`
- Follow Vue 3 reactivity patterns
- Use proper prop validation
- Emit events with proper typing

#### CSS/SCSS Guidelines
- Use design tokens instead of hardcoded values
- Follow BEM-like naming convention with `tx-` prefix
- Use logical properties for RTL support
- Optimize for performance (avoid expensive selectors)

#### Accessibility
- Include proper ARIA attributes
- Ensure keyboard navigation works
- Test with screen readers
- Maintain sufficient color contrast
- Support reduced motion preferences

### Testing Requirements

#### Unit Tests
- Test component rendering
- Test prop variations
- Test event emissions
- Test accessibility features
- Achieve >90% code coverage

#### Visual Regression Tests
```bash
# Run visual tests
pnpm test:visual

# Update snapshots
pnpm test:visual:update
```

#### Accessibility Tests
```typescript
import { axe, toHaveNoViolations } from 'jest-axe'

expect.extend(toHaveNoViolations)

it('should not have accessibility violations', async () => {
  const wrapper = mount(ComponentName)
  const results = await axe(wrapper.element)
  expect(results).toHaveNoViolations()
})
```

## Pull Request Process

### Before Submitting

1. **Run the full test suite**:
```bash
pnpm test
pnpm test:visual
pnpm lint
pnpm type-check
```

2. **Update documentation**:
- Add or update component docs
- Include examples and API documentation
- Update changelog if needed

3. **Test across browsers**:
- Chrome, Firefox, Safari, Edge
- Mobile browsers (iOS Safari, Chrome Mobile)
- Test with keyboard navigation
- Test with screen readers

### PR Guidelines

#### Title Format
```
type(scope): description

Examples:
feat(button): add loading state animation
fix(modal): resolve focus trap issue
docs(getting-started): update installation guide
```

#### Description Template
```markdown
## What
Brief description of changes

## Why
Explanation of the problem being solved

## How
Technical approach and implementation details

## Testing
- [ ] Unit tests pass
- [ ] Visual regression tests pass
- [ ] Accessibility tests pass
- [ ] Manual testing completed

## Screenshots
Include before/after screenshots for UI changes

## Breaking Changes
List any breaking changes and migration steps
```

### Review Process

1. **Automated checks** must pass:
   - Tests and linting
   - Build verification
   - Visual regression tests

2. **Code review** by maintainers:
   - Code quality and standards
   - Design system consistency
   - Accessibility compliance
   - Performance considerations

3. **Design review** (for UI changes):
   - Visual consistency
   - Interaction patterns
   - Responsive behavior

## Community Guidelines

### Code of Conduct
We follow the [Contributor Covenant](https://www.contributor-covenant.org/). Please be respectful, inclusive, and constructive in all interactions.

### Communication Channels
- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and community discussions
- **Discord**: Real-time chat and collaboration
- **Twitter**: Updates and announcements

### Recognition
Contributors are recognized in:
- Release notes and changelog
- Contributors page on our website
- Special badges for significant contributions
- Annual contributor appreciation events

## Release Process

### Versioning
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Schedule
- **Patch releases**: As needed for critical fixes
- **Minor releases**: Monthly feature releases
- **Major releases**: Quarterly with breaking changes

### Beta Testing
Join our beta program to test upcoming features:
```bash
pnpm add @talex-touch/touchx-ui@beta
```

## Getting Help

### Documentation
- [Component API Reference](/components/)
- [Design System Guide](/design/)
- [Migration Guides](/guide/migration)

### Support Channels
- **GitHub Issues**: Technical problems
- **GitHub Discussions**: General questions
- **Discord**: Real-time help
- **Stack Overflow**: Tag with `touchx-ui`

### Mentorship Program
New contributors can request mentorship:
- Pair programming sessions
- Code review guidance
- Design system education
- Career development advice

---

Thank you for contributing to TouchX UI! Your efforts help make beautiful, accessible interfaces available to developers worldwide. 🎉
