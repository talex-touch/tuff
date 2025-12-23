# Iconography

TouchX UI's icon system provides a comprehensive, consistent, and accessible visual language. Our icons are designed to be clear, recognizable, and harmonious with the overall design aesthetic.

## Icon Philosophy

### Universal Recognition
Icons should be immediately recognizable across cultures and contexts, using established visual metaphors and conventions.

### Consistent Style
All icons follow the same design principles, creating a cohesive visual system that feels unified and professional.

### Scalable Clarity
Icons remain clear and legible at all sizes, from 12px mobile interfaces to large desktop displays.

## Design Principles

### 1. Geometric Foundation
Icons are built on a consistent geometric grid system.

```css
/* Icon grid system */
--tx-icon-grid: 24px;        /* Base grid size */
--tx-icon-stroke: 2px;       /* Consistent stroke width */
--tx-icon-radius: 2px;       /* Corner radius for consistency */
```

### 2. Optical Balance
Visual weight is carefully balanced for harmonious appearance.

### 3. Minimal Detail
Icons use only essential details to maintain clarity at small sizes.

## Icon Sizes

### Size Scale
Consistent sizing for different contexts and hierarchies.

<div class="icon-sizes">
  <div class="size-demo">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
    <span class="size-label">xs - 16px</span>
    <span class="size-usage">Inline text, dense layouts</span>
  </div>
  
  <div class="size-demo">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
    <span class="size-label">sm - 20px</span>
    <span class="size-usage">Form inputs, buttons</span>
  </div>
  
  <div class="size-demo">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
    <span class="size-label">md - 24px</span>
    <span class="size-usage">Standard UI elements</span>
  </div>
  
  <div class="size-demo">
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
    <span class="size-label">lg - 32px</span>
    <span class="size-usage">Prominent actions, headers</span>
  </div>
  
  <div class="size-demo">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
    <span class="size-label">xl - 48px</span>
    <span class="size-usage">Feature highlights, empty states</span>
  </div>
</div>

```css
/* Icon size tokens */
--tx-icon-xs: 16px;
--tx-icon-sm: 20px;
--tx-icon-md: 24px;
--tx-icon-lg: 32px;
--tx-icon-xl: 48px;
--tx-icon-2xl: 64px;
```

## Icon Categories

### Navigation Icons
Essential icons for navigation and wayfinding.

<div class="icon-grid">
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
    <span>Home</span>
  </div>
  
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
    <span>Menu</span>
  </div>
  
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M15 19l-7-7 7-7"/>
    </svg>
    <span>Back</span>
  </div>
  
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 5l7 7-7 7"/>
    </svg>
    <span>Forward</span>
  </div>
</div>

### Action Icons
Icons for common user actions and interactions.

<div class="icon-grid">
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14m7-7H5"/>
    </svg>
    <span>Add</span>
  </div>
  
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    <span>Edit</span>
  </div>
  
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
    <span>Delete</span>
  </div>
  
  <div class="icon-item">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
    <span>Search</span>
  </div>
</div>

### Status Icons
Visual indicators for different states and feedback.

<div class="icon-grid">
  <div class="icon-item status-success">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <path d="M22 4L12 14.01l-3-3"/>
    </svg>
    <span>Success</span>
  </div>
  
  <div class="icon-item status-warning">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      <path d="M12 9v4m0 4h.01"/>
    </svg>
    <span>Warning</span>
  </div>
  
  <div class="icon-item status-error">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M15 9l-6 6m0-6l6 6"/>
    </svg>
    <span>Error</span>
  </div>
  
  <div class="icon-item status-info">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4m0-4h.01"/>
    </svg>
    <span>Info</span>
  </div>
</div>

## Icon Styles

### Outline Style (Default)
Clean, minimal outlines with consistent stroke weight.

```css
.tx-icon-outline {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
```

### Filled Style
Solid fills for emphasis and hierarchy.

```css
.tx-icon-filled {
  fill: currentColor;
  stroke: none;
}
```

### Duotone Style
Two-color icons for enhanced visual hierarchy.

```css
.tx-icon-duotone .primary {
  fill: currentColor;
  opacity: 1;
}

.tx-icon-duotone .secondary {
  fill: currentColor;
  opacity: 0.3;
}
```

## Implementation

### Vue Icon Component
```vue
<template>
  <svg
    :class="iconClasses"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <slot />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: number | string
  variant?: 'outline' | 'filled' | 'duotone'
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
  variant: 'outline'
})

const iconClasses = computed(() => [
  'tx-icon',
  `tx-icon-${props.variant}`,
  {
    'tx-icon-colored': props.color
  }
])
</script>

<style scoped>
.tx-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}

.tx-icon-outline {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.tx-icon-filled {
  fill: currentColor;
  stroke: none;
}

.tx-icon-colored {
  color: var(--icon-color);
}
</style>
```

### React Icon Component
```jsx
import React from 'react'
import { cn } from '@/lib/utils'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  variant?: 'outline' | 'filled' | 'duotone'
  children: React.ReactNode
}

export const Icon: React.FC<IconProps> = ({
  size = 24,
  variant = 'outline',
  className,
  children,
  ...props
}) => {
  return (
    <svg
      className={cn(
        'tx-icon',
        `tx-icon-${variant}`,
        className
      )}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}
```

## Accessibility

### Semantic Usage
```vue
<template>
  <!-- Decorative icon -->
  <TxIcon aria-hidden="true">
    <path d="M12 5v14m7-7H5"/>
  </TxIcon>
  
  <!-- Meaningful icon with label -->
  <TxIcon aria-label="Add new item">
    <path d="M12 5v14m7-7H5"/>
  </TxIcon>
  
  <!-- Icon with visible text -->
  <button>
    <TxIcon aria-hidden="true">
      <path d="M12 5v14m7-7H5"/>
    </TxIcon>
    Add Item
  </button>
</template>
```

### Color and Contrast
```css
/* Ensure sufficient contrast */
.tx-icon {
  color: var(--tx-text-primary);
}

.tx-icon-secondary {
  color: var(--tx-text-secondary);
}

.tx-icon-success {
  color: var(--tx-success-600);
}

.tx-icon-warning {
  color: var(--tx-warning-600);
}

.tx-icon-danger {
  color: var(--tx-danger-600);
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .tx-icon {
    stroke-width: 2.5;
  }
}
```

## Custom Icons

### Design Guidelines
When creating custom icons for TouchX UI:

1. **Use the 24x24 grid** as your base canvas
2. **Maintain 2px stroke width** for consistency
3. **Use rounded line caps and joins** for a friendly feel
4. **Keep details minimal** for scalability
5. **Test at multiple sizes** to ensure clarity

### SVG Optimization
```bash
# Optimize SVGs for web use
npx svgo --config svgo.config.js icons/*.svg
```

```javascript
// svgo.config.js
module.exports = {
  plugins: [
    'removeDoctype',
    'removeXMLProcInst',
    'removeComments',
    'removeMetadata',
    'removeTitle',
    'removeDesc',
    'removeUselessDefs',
    'removeEditorsNSData',
    'removeEmptyAttrs',
    'removeHiddenElems',
    'removeEmptyText',
    'removeEmptyContainers',
    'removeViewBox',
    'cleanupEnableBackground',
    'convertStyleToAttrs',
    'convertColors',
    'convertPathData',
    'convertTransform',
    'removeUnknownsAndDefaults',
    'removeNonInheritableGroupAttrs',
    'removeUselessStrokeAndFill',
    'removeUnusedNS',
    'cleanupIDs',
    'cleanupNumericValues',
    'moveElemsAttrsToGroup',
    'moveGroupAttrsToElems',
    'collapseGroups',
    'removeRasterImages',
    'mergePaths',
    'convertShapeToPath',
    'sortAttrs',
    'removeDimensions'
  ]
}
```

## Best Practices

### Do's ✅
- Use consistent stroke weights across all icons
- Provide appropriate aria-labels for meaningful icons
- Test icons at different sizes and contexts
- Use semantic color tokens for status icons
- Optimize SVGs for performance

### Don'ts ❌
- Don't mix different icon styles in the same interface
- Don't use icons without considering accessibility
- Don't create overly complex icons with too much detail
- Don't ignore the established visual metaphors
- Don't forget to test in high contrast mode

<style scoped>
.icon-sizes {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 2rem 0;
}

.size-demo {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
}

.size-label {
  font-family: monospace;
  font-weight: 600;
  min-width: 80px;
}

.size-usage {
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
  margin: 2rem 0;
}

.icon-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  text-align: center;
}

.icon-item span {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.status-success {
  color: var(--vp-c-green);
}

.status-warning {
  color: var(--vp-c-yellow);
}

.status-error {
  color: var(--vp-c-red);
}

.status-info {
  color: var(--vp-c-blue);
}
</style>
