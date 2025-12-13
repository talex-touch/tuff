# Color System

TouchX UI's color system is designed to create beautiful, accessible, and emotionally resonant interfaces. Our palette combines scientific color theory with human psychology to deliver experiences that feel both natural and delightful.

## Color Philosophy

### Emotional Resonance
Colors in TouchX UI are chosen not just for their visual appeal, but for their psychological impact:

- **🔵 Primary Blue**: Trust, reliability, and professionalism
- **🟢 Success Green**: Growth, harmony, and positive outcomes  
- **🟡 Warning Amber**: Attention, caution, and energy
- **🔴 Danger Red**: Urgency, importance, and critical actions
- **⚫ Neutral Grays**: Balance, sophistication, and clarity

### Accessibility First
Every color combination in our system meets or exceeds WCAG 2.1 AA standards:
- **Contrast Ratio**: Minimum 4.5:1 for normal text, 3:1 for large text
- **Color Blindness**: Tested with Deuteranopia, Protanopia, and Tritanopia
- **High Contrast Mode**: Full support for system accessibility preferences

## Primary Palette

### TouchX Blue
Our signature color, carefully crafted for maximum impact and accessibility.

<div class="color-scale">
  <div class="color-item" style="background: #eff6ff; color: #1e3a8a;">
    <span class="shade">50</span>
    <span class="hex">#eff6ff</span>
    <span class="usage">Backgrounds, subtle accents</span>
  </div>
  <div class="color-item" style="background: #dbeafe; color: #1e3a8a;">
    <span class="shade">100</span>
    <span class="hex">#dbeafe</span>
    <span class="usage">Hover states, light backgrounds</span>
  </div>
  <div class="color-item" style="background: #bfdbfe; color: #1e3a8a;">
    <span class="shade">200</span>
    <span class="hex">#bfdbfe</span>
    <span class="usage">Disabled states, placeholders</span>
  </div>
  <div class="color-item" style="background: #93c5fd; color: #1e3a8a;">
    <span class="shade">300</span>
    <span class="hex">#93c5fd</span>
    <span class="usage">Secondary elements</span>
  </div>
  <div class="color-item" style="background: #60a5fa; color: white;">
    <span class="shade">400</span>
    <span class="hex">#60a5fa</span>
    <span class="usage">Interactive elements</span>
  </div>
  <div class="color-item" style="background: #3b82f6; color: white;">
    <span class="shade">500</span>
    <span class="hex">#3b82f6</span>
    <span class="usage">Primary actions, links</span>
  </div>
  <div class="color-item" style="background: #2563eb; color: white;">
    <span class="shade">600</span>
    <span class="hex">#2563eb</span>
    <span class="usage">Hover states, emphasis</span>
  </div>
  <div class="color-item" style="background: #1d4ed8; color: white;">
    <span class="shade">700</span>
    <span class="hex">#1d4ed8</span>
    <span class="usage">Active states, pressed</span>
  </div>
  <div class="color-item" style="background: #1e40af; color: white;">
    <span class="shade">800</span>
    <span class="hex">#1e40af</span>
    <span class="usage">Dark themes, high contrast</span>
  </div>
  <div class="color-item" style="background: #1e3a8a; color: white;">
    <span class="shade">900</span>
    <span class="hex">#1e3a8a</span>
    <span class="usage">Text, dark backgrounds</span>
  </div>
</div>

## Semantic Colors

### Success Green
Communicates positive outcomes, completion, and growth.

```css
--tx-success-50: #f0fdf4;
--tx-success-500: #22c55e;  /* Primary success color */
--tx-success-700: #15803d;  /* Dark mode, emphasis */
```

### Warning Amber  
Draws attention to important information without alarm.

```css
--tx-warning-50: #fffbeb;
--tx-warning-500: #f59e0b;  /* Primary warning color */
--tx-warning-700: #d97706;  /* Dark mode, emphasis */
```

### Danger Red
Indicates errors, destructive actions, and critical states.

```css
--tx-danger-50: #fef2f2;
--tx-danger-500: #ef4444;   /* Primary danger color */
--tx-danger-700: #dc2626;   /* Dark mode, emphasis */
```

## Neutral Palette

### Gray Scale
Sophisticated neutrals for text, backgrounds, and UI elements.

<div class="neutral-scale">
  <div class="neutral-item" style="background: #f9fafb; color: #111827;">
    <span class="shade">Gray 50</span>
    <span class="hex">#f9fafb</span>
  </div>
  <div class="neutral-item" style="background: #f3f4f6; color: #111827;">
    <span class="shade">Gray 100</span>
    <span class="hex">#f3f4f6</span>
  </div>
  <div class="neutral-item" style="background: #e5e7eb; color: #111827;">
    <span class="shade">Gray 200</span>
    <span class="hex">#e5e7eb</span>
  </div>
  <div class="neutral-item" style="background: #6b7280; color: white;">
    <span class="shade">Gray 500</span>
    <span class="hex">#6b7280</span>
  </div>
  <div class="neutral-item" style="background: #374151; color: white;">
    <span class="shade">Gray 700</span>
    <span class="hex">#374151</span>
  </div>
  <div class="neutral-item" style="background: #111827; color: white;">
    <span class="shade">Gray 900</span>
    <span class="hex">#111827</span>
  </div>
</div>

## Theme Adaptation

### Light Theme
Optimized for daytime use and bright environments.

```css
:root {
  --tx-bg-primary: #ffffff;
  --tx-bg-secondary: #f9fafb;
  --tx-text-primary: #111827;
  --tx-text-secondary: #6b7280;
  --tx-border-primary: #e5e7eb;
  --tx-shadow-color: rgba(0, 0, 0, 0.1);
}
```

### Dark Theme
Reduces eye strain in low-light conditions.

```css
[data-theme="dark"] {
  --tx-bg-primary: #111827;
  --tx-bg-secondary: #1f2937;
  --tx-text-primary: #f9fafb;
  --tx-text-secondary: #d1d5db;
  --tx-border-primary: #374151;
  --tx-shadow-color: rgba(0, 0, 0, 0.3);
}
```

## Glassmorphism Colors

### Glass Surfaces
Semi-transparent surfaces with backdrop blur for depth.

```css
--tx-glass-white: rgba(255, 255, 255, 0.1);
--tx-glass-white-strong: rgba(255, 255, 255, 0.2);
--tx-glass-dark: rgba(0, 0, 0, 0.1);
--tx-glass-dark-strong: rgba(0, 0, 0, 0.2);

/* Usage */
.glass-card {
  background: var(--tx-glass-white);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
```

## Color Usage Guidelines

### Do's ✅
- Use semantic colors for their intended purpose
- Maintain sufficient contrast ratios
- Test colors in both light and dark themes
- Consider color blindness accessibility
- Use neutral colors for large areas

### Don'ts ❌
- Don't use color as the only way to convey information
- Don't use too many colors in a single interface
- Don't ignore accessibility guidelines
- Don't use pure black (#000000) or pure white (#ffffff)
- Don't mix warm and cool grays

## Implementation Examples

### Button Color States
```vue
<template>
  <div class="button-examples">
    <button class="btn btn-primary">Primary</button>
    <button class="btn btn-success">Success</button>
    <button class="btn btn-warning">Warning</button>
    <button class="btn btn-danger">Danger</button>
  </div>
</template>

<style scoped>
.btn {
  padding: var(--tx-space-2) var(--tx-space-4);
  border-radius: var(--tx-radius-md);
  border: none;
  font-weight: 500;
  transition: all var(--tx-duration-fast) var(--tx-ease-out);
}

.btn-primary {
  background: var(--tx-color-primary);
  color: white;
}

.btn-primary:hover {
  background: var(--tx-blue-600);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.btn-success {
  background: var(--tx-success-500);
  color: white;
}

.btn-warning {
  background: var(--tx-warning-500);
  color: white;
}

.btn-danger {
  background: var(--tx-danger-500);
  color: white;
}
</style>
```

<style scoped>
.color-scale, .neutral-scale {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 1.5rem 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.color-item, .neutral-item {
  padding: 1rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

.shade {
  font-weight: 600;
}

.hex {
  font-family: monospace;
  font-size: 0.75rem;
}

.usage {
  font-size: 0.75rem;
  opacity: 0.8;
  font-style: italic;
}

.button-examples {
  display: flex;
  gap: 1rem;
  margin: 1rem 0;
}
</style>
