# Design Tokens

Design tokens are the visual design atoms of TouchX UI. They store visual design attributes like colors, typography, spacing, and animation values in a platform-agnostic way, ensuring consistency across all components and platforms.

## Philosophy

TouchX UI's design token system is built on three core principles:

- **🎯 Semantic Naming**: Tokens are named by their purpose, not their value
- **🔄 Scalable Architecture**: Hierarchical token structure that scales from simple to complex
- **🌈 Context Awareness**: Tokens adapt to different themes and contexts automatically

## Token Architecture

### Tier 1: Primitive Tokens
Raw values that form the foundation of our design system.

```css
/* Color Primitives */
--tx-blue-50: #eff6ff;
--tx-blue-100: #dbeafe;
--tx-blue-500: #3b82f6;
--tx-blue-900: #1e3a8a;

/* Size Primitives */
--tx-space-1: 0.25rem;  /* 4px */
--tx-space-2: 0.5rem;   /* 8px */
--tx-space-4: 1rem;     /* 16px */
--tx-space-8: 2rem;     /* 32px */

/* Typography Primitives */
--tx-font-size-xs: 0.75rem;
--tx-font-size-sm: 0.875rem;
--tx-font-size-base: 1rem;
--tx-font-size-lg: 1.125rem;
```

### Tier 2: Semantic Tokens
Purpose-driven tokens that reference primitive tokens.

```css
/* Semantic Colors */
--tx-color-primary: var(--tx-blue-500);
--tx-color-success: var(--tx-green-500);
--tx-color-warning: var(--tx-yellow-500);
--tx-color-danger: var(--tx-red-500);

/* Semantic Spacing */
--tx-spacing-component-padding: var(--tx-space-4);
--tx-spacing-component-margin: var(--tx-space-2);
--tx-spacing-section-gap: var(--tx-space-8);

/* Semantic Typography */
--tx-text-heading: var(--tx-font-size-lg);
--tx-text-body: var(--tx-font-size-base);
--tx-text-caption: var(--tx-font-size-sm);
```

### Tier 3: Component Tokens
Component-specific tokens for fine-grained control.

```css
/* Button Tokens */
--tx-button-padding-x: var(--tx-space-4);
--tx-button-padding-y: var(--tx-space-2);
--tx-button-border-radius: var(--tx-radius-md);
--tx-button-font-weight: 500;

/* Card Tokens */
--tx-card-padding: var(--tx-space-6);
--tx-card-border-radius: var(--tx-radius-lg);
--tx-card-shadow: var(--tx-shadow-md);
```

## Color System

### Primary Palette
Our signature TouchX UI blue, designed for maximum accessibility and visual impact.

<div class="color-palette">
  <div class="color-swatch" style="background: #eff6ff;">
    <span class="color-name">Blue 50</span>
    <span class="color-value">#eff6ff</span>
  </div>
  <div class="color-swatch" style="background: #3b82f6; color: white;">
    <span class="color-name">Blue 500</span>
    <span class="color-value">#3b82f6</span>
  </div>
  <div class="color-swatch" style="background: #1e3a8a; color: white;">
    <span class="color-name">Blue 900</span>
    <span class="color-value">#1e3a8a</span>
  </div>
</div>

### Semantic Colors
Context-aware colors that communicate meaning.

```css
:root {
  /* Light Theme */
  --tx-color-text-primary: #1f2937;
  --tx-color-text-secondary: #6b7280;
  --tx-color-background: #ffffff;
  --tx-color-surface: #f9fafb;
  --tx-color-border: #e5e7eb;
}

[data-theme="dark"] {
  /* Dark Theme */
  --tx-color-text-primary: #f9fafb;
  --tx-color-text-secondary: #d1d5db;
  --tx-color-background: #111827;
  --tx-color-surface: #1f2937;
  --tx-color-border: #374151;
}
```

## Typography Scale

### Font Families
```css
--tx-font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--tx-font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
--tx-font-family-display: 'Cal Sans', 'Inter', sans-serif;
```

### Type Scale
Based on a 1.25 ratio for harmonious proportions.

```css
--tx-text-xs: 0.75rem;    /* 12px */
--tx-text-sm: 0.875rem;   /* 14px */
--tx-text-base: 1rem;     /* 16px */
--tx-text-lg: 1.125rem;   /* 18px */
--tx-text-xl: 1.25rem;    /* 20px */
--tx-text-2xl: 1.5rem;    /* 24px */
--tx-text-3xl: 1.875rem;  /* 30px */
--tx-text-4xl: 2.25rem;   /* 36px */
```

## Spacing System

### Base Unit
All spacing is based on a 4px base unit for pixel-perfect alignment.

```css
--tx-space-px: 1px;
--tx-space-0: 0;
--tx-space-1: 0.25rem;  /* 4px */
--tx-space-2: 0.5rem;   /* 8px */
--tx-space-3: 0.75rem;  /* 12px */
--tx-space-4: 1rem;     /* 16px */
--tx-space-5: 1.25rem;  /* 20px */
--tx-space-6: 1.5rem;   /* 24px */
--tx-space-8: 2rem;     /* 32px */
--tx-space-10: 2.5rem;  /* 40px */
--tx-space-12: 3rem;    /* 48px */
--tx-space-16: 4rem;    /* 64px */
--tx-space-20: 5rem;    /* 80px */
--tx-space-24: 6rem;    /* 96px */
```

## Animation Tokens

### Duration
```css
--tx-duration-instant: 0ms;
--tx-duration-fast: 150ms;
--tx-duration-normal: 250ms;
--tx-duration-slow: 350ms;
--tx-duration-slower: 500ms;
```

### Easing Functions
```css
--tx-ease-linear: linear;
--tx-ease-in: cubic-bezier(0.4, 0, 1, 1);
--tx-ease-out: cubic-bezier(0, 0, 0.2, 1);
--tx-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--tx-ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--tx-ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

## Usage Examples

### Custom Component Styling
```vue
<template>
  <div class="custom-card">
    <h3 class="custom-title">Custom Card</h3>
    <p class="custom-content">Using design tokens for consistency</p>
  </div>
</template>

<style scoped>
.custom-card {
  padding: var(--tx-space-6);
  border-radius: var(--tx-radius-lg);
  background: var(--tx-color-surface);
  border: 1px solid var(--tx-color-border);
  box-shadow: var(--tx-shadow-sm);
  transition: all var(--tx-duration-normal) var(--tx-ease-out);
}

.custom-title {
  font-size: var(--tx-text-lg);
  font-weight: 600;
  color: var(--tx-color-text-primary);
  margin-bottom: var(--tx-space-2);
}

.custom-content {
  font-size: var(--tx-text-base);
  color: var(--tx-color-text-secondary);
  line-height: 1.5;
}
</style>
```

### Theme Customization
```css
/* Custom theme override */
:root {
  --tx-color-primary: #8b5cf6;  /* Purple instead of blue */
  --tx-radius-base: 12px;       /* More rounded corners */
  --tx-font-family-sans: 'Poppins', sans-serif;  /* Custom font */
}
```

<style scoped>
.color-palette {
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
}

.color-swatch {
  padding: 1rem;
  border-radius: 8px;
  min-width: 120px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.color-name {
  font-weight: 600;
  font-size: 0.875rem;
}

.color-value {
  font-family: monospace;
  font-size: 0.75rem;
  opacity: 0.8;
}
</style>
