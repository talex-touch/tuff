# Typography

Typography in TouchX UI is designed to create clear hierarchies, enhance readability, and convey personality. Our type system balances functionality with aesthetic appeal, ensuring content is both beautiful and accessible.

## Typography Philosophy

### Clarity First
Every typographic decision prioritizes readability and comprehension:
- **Optimal line heights** for comfortable reading
- **Appropriate font sizes** for different contexts
- **Sufficient contrast** for accessibility
- **Consistent spacing** for visual rhythm

### Expressive Hierarchy
Typography creates clear information architecture:
- **Display fonts** for impact and personality
- **Body fonts** for extended reading
- **Monospace fonts** for code and data

## Font Families

### Primary: Inter
Our primary typeface for UI elements and body text.

```css
--tx-font-family-sans: 'Inter', -apple-system, BlinkMacSystemFont, 
                       'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 
                       'Cantarell', sans-serif;
```

**Characteristics:**
- Excellent readability at all sizes
- Optimized for digital screens
- Supports 139+ languages
- Variable font technology
- Open source and web-optimized

### Display: Cal Sans
For headlines and brand moments that need extra personality.

```css
--tx-font-family-display: 'Cal Sans', 'Inter', -apple-system, 
                          BlinkMacSystemFont, sans-serif;
```

**Usage:**
- Hero headlines
- Section titles
- Marketing content
- Brand expressions

### Monospace: JetBrains Mono
For code, data, and technical content.

```css
--tx-font-family-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', 
                       'Monaco', 'Inconsolata', 'Roboto Mono', 
                       'Source Code Pro', monospace;
```

**Features:**
- Ligature support
- Optimized for coding
- Clear character distinction
- Multiple weights available

## Type Scale

### Modular Scale (1.25 Ratio)
Our type scale is based on a 1.25 ratio for harmonious proportions.

<div class="type-scale">
  <div class="type-example" style="font-size: 3rem; font-weight: 800; line-height: 1.1;">
    <span class="size-label">4xl - 48px</span>
    <span class="sample-text">Hero Headlines</span>
  </div>
  <div class="type-example" style="font-size: 2.25rem; font-weight: 700; line-height: 1.2;">
    <span class="size-label">3xl - 36px</span>
    <span class="sample-text">Page Titles</span>
  </div>
  <div class="type-example" style="font-size: 1.875rem; font-weight: 600; line-height: 1.3;">
    <span class="size-label">2xl - 30px</span>
    <span class="sample-text">Section Headers</span>
  </div>
  <div class="type-example" style="font-size: 1.5rem; font-weight: 600; line-height: 1.4;">
    <span class="size-label">xl - 24px</span>
    <span class="sample-text">Component Titles</span>
  </div>
  <div class="type-example" style="font-size: 1.25rem; font-weight: 500; line-height: 1.5;">
    <span class="size-label">lg - 20px</span>
    <span class="sample-text">Subheadings</span>
  </div>
  <div class="type-example" style="font-size: 1rem; font-weight: 400; line-height: 1.6;">
    <span class="size-label">base - 16px</span>
    <span class="sample-text">Body text and paragraphs</span>
  </div>
  <div class="type-example" style="font-size: 0.875rem; font-weight: 400; line-height: 1.5;">
    <span class="size-label">sm - 14px</span>
    <span class="sample-text">Secondary text and captions</span>
  </div>
  <div class="type-example" style="font-size: 0.75rem; font-weight: 400; line-height: 1.4;">
    <span class="size-label">xs - 12px</span>
    <span class="sample-text">Labels and metadata</span>
  </div>
</div>

## Font Weights

### Weight Scale
Carefully selected weights for different contexts.

```css
--tx-font-weight-light: 300;     /* Subtle text, large sizes */
--tx-font-weight-normal: 400;    /* Body text, default */
--tx-font-weight-medium: 500;    /* Emphasis, buttons */
--tx-font-weight-semibold: 600;  /* Headings, important text */
--tx-font-weight-bold: 700;      /* Strong emphasis */
--tx-font-weight-extrabold: 800; /* Display text, heroes */
```

### Usage Guidelines

<div class="weight-examples">
  <div class="weight-example">
    <span class="weight-demo" style="font-weight: 300;">Light (300)</span>
    <span class="weight-usage">Large text, subtle emphasis</span>
  </div>
  <div class="weight-example">
    <span class="weight-demo" style="font-weight: 400;">Normal (400)</span>
    <span class="weight-usage">Body text, default weight</span>
  </div>
  <div class="weight-example">
    <span class="weight-demo" style="font-weight: 500;">Medium (500)</span>
    <span class="weight-usage">Buttons, form labels</span>
  </div>
  <div class="weight-example">
    <span class="weight-demo" style="font-weight: 600;">Semibold (600)</span>
    <span class="weight-usage">Headings, navigation</span>
  </div>
  <div class="weight-example">
    <span class="weight-demo" style="font-weight: 700;">Bold (700)</span>
    <span class="weight-usage">Strong emphasis, alerts</span>
  </div>
  <div class="weight-example">
    <span class="weight-demo" style="font-weight: 800;">Extra Bold (800)</span>
    <span class="weight-usage">Display headlines</span>
  </div>
</div>

## Line Heights

### Optimized for Readability
Line heights are optimized for different text sizes and contexts.

```css
--tx-leading-none: 1;        /* Tight headlines */
--tx-leading-tight: 1.25;    /* Display text */
--tx-leading-snug: 1.375;    /* Headings */
--tx-leading-normal: 1.5;    /* Body text */
--tx-leading-relaxed: 1.625; /* Long-form content */
--tx-leading-loose: 2;       /* Spacious layouts */
```

## Letter Spacing

### Subtle Adjustments for Clarity
Carefully tuned letter spacing for optimal readability.

```css
--tx-tracking-tighter: -0.05em;  /* Large display text */
--tx-tracking-tight: -0.025em;   /* Headlines */
--tx-tracking-normal: 0;         /* Body text */
--tx-tracking-wide: 0.025em;     /* All caps, small text */
--tx-tracking-wider: 0.05em;     /* Buttons, labels */
--tx-tracking-widest: 0.1em;     /* Emphasis, spacing */
```

## Text Colors

### Semantic Text Colors
Context-aware colors for different text purposes.

```css
/* Light Theme */
--tx-text-primary: #111827;      /* Main content */
--tx-text-secondary: #6b7280;    /* Supporting text */
--tx-text-tertiary: #9ca3af;     /* Subtle text */
--tx-text-inverse: #ffffff;      /* Text on dark backgrounds */
--tx-text-link: #3b82f6;         /* Interactive text */
--tx-text-success: #059669;      /* Success messages */
--tx-text-warning: #d97706;      /* Warning messages */
--tx-text-danger: #dc2626;       /* Error messages */

/* Dark Theme */
[data-theme="dark"] {
  --tx-text-primary: #f9fafb;
  --tx-text-secondary: #d1d5db;
  --tx-text-tertiary: #9ca3af;
  --tx-text-inverse: #111827;
}
```

## Typography Components

### Headings
```vue
<template>
  <div class="typography-demo">
    <h1 class="tx-heading-1">Heading 1</h1>
    <h2 class="tx-heading-2">Heading 2</h2>
    <h3 class="tx-heading-3">Heading 3</h3>
    <h4 class="tx-heading-4">Heading 4</h4>
  </div>
</template>

<style scoped>
.tx-heading-1 {
  font-size: var(--tx-text-4xl);
  font-weight: var(--tx-font-weight-extrabold);
  line-height: var(--tx-leading-tight);
  letter-spacing: var(--tx-tracking-tight);
  color: var(--tx-text-primary);
}

.tx-heading-2 {
  font-size: var(--tx-text-3xl);
  font-weight: var(--tx-font-weight-bold);
  line-height: var(--tx-leading-tight);
  color: var(--tx-text-primary);
}

.tx-heading-3 {
  font-size: var(--tx-text-2xl);
  font-weight: var(--tx-font-weight-semibold);
  line-height: var(--tx-leading-snug);
  color: var(--tx-text-primary);
}

.tx-heading-4 {
  font-size: var(--tx-text-xl);
  font-weight: var(--tx-font-weight-semibold);
  line-height: var(--tx-leading-snug);
  color: var(--tx-text-primary);
}
</style>
```

### Body Text
```vue
<template>
  <div class="content">
    <p class="tx-body-large">
      Large body text for introductions and important content.
    </p>
    <p class="tx-body">
      Regular body text for main content and paragraphs.
    </p>
    <p class="tx-body-small">
      Small body text for captions and secondary information.
    </p>
  </div>
</template>

<style scoped>
.tx-body-large {
  font-size: var(--tx-text-lg);
  line-height: var(--tx-leading-relaxed);
  color: var(--tx-text-primary);
}

.tx-body {
  font-size: var(--tx-text-base);
  line-height: var(--tx-leading-normal);
  color: var(--tx-text-primary);
}

.tx-body-small {
  font-size: var(--tx-text-sm);
  line-height: var(--tx-leading-normal);
  color: var(--tx-text-secondary);
}
</style>
```

## Accessibility

### WCAG Compliance
- **Contrast ratios** meet WCAG AA standards (4.5:1 minimum)
- **Font sizes** are at least 16px for body text
- **Line heights** provide comfortable reading
- **Color is not the only indicator** of meaning

### Responsive Typography
```css
/* Mobile-first responsive typography */
.responsive-heading {
  font-size: var(--tx-text-2xl);
  line-height: var(--tx-leading-tight);
}

@media (min-width: 768px) {
  .responsive-heading {
    font-size: var(--tx-text-3xl);
  }
}

@media (min-width: 1024px) {
  .responsive-heading {
    font-size: var(--tx-text-4xl);
  }
}
```

<style scoped>
.type-scale {
  margin: 2rem 0;
}

.type-example {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin: 1rem 0;
  padding: 1rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.size-label {
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--vp-c-text-2);
  min-width: 100px;
  flex-shrink: 0;
}

.sample-text {
  color: var(--vp-c-text-1);
}

.weight-examples {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 1rem 0;
}

.weight-example {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.weight-demo {
  font-size: 1.125rem;
  min-width: 140px;
}

.weight-usage {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}
</style>
