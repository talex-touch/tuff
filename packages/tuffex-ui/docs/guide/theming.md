# Theming

TouchX UI's theming system is built on CSS custom properties (variables) and design tokens, making it easy to customize the appearance while maintaining consistency and accessibility. Create unique brand experiences without losing the core functionality and quality of TouchX UI components.

## Theming Architecture

### Design Token Hierarchy

TouchX UI uses a three-tier token system:

1. **Primitive Tokens**: Raw values (colors, sizes, fonts)
2. **Semantic Tokens**: Purpose-driven tokens that reference primitives
3. **Component Tokens**: Component-specific customizations

```css
/* Primitive tokens */
--tx-blue-500: #3b82f6;
--tx-space-4: 1rem;

/* Semantic tokens */
--tx-color-primary: var(--tx-blue-500);
--tx-component-padding: var(--tx-space-4);

/* Component tokens */
--tx-button-padding-x: var(--tx-component-padding);
--tx-button-color: var(--tx-color-primary);
```

## Quick Customization

### Override CSS Variables

The simplest way to customize TouchX UI is by overriding CSS variables:

```css
:root {
  /* Change primary color */
  --tx-color-primary: #8b5cf6;
  --tx-color-primary-hover: #7c3aed;
  
  /* Adjust border radius */
  --tx-radius-base: 12px;
  --tx-radius-lg: 16px;
  
  /* Customize spacing */
  --tx-space-base: 1.2rem;
  
  /* Update typography */
  --tx-font-family-sans: 'Poppins', sans-serif;
}
```

### Component-Specific Overrides

Target specific components without affecting others:

```css
/* Customize buttons only */
.tx-button {
  --tx-button-border-radius: 24px;
  --tx-button-font-weight: 600;
  --tx-button-text-transform: uppercase;
  --tx-button-letter-spacing: 0.05em;
}

/* Customize cards only */
.tx-card {
  --tx-card-padding: 2rem;
  --tx-card-border-radius: 20px;
  --tx-card-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
}
```

## Complete Theme Creation

### 1. Define Your Brand Colors

```css
:root {
  /* Brand color palette */
  --brand-primary-50: #faf5ff;
  --brand-primary-100: #f3e8ff;
  --brand-primary-200: #e9d5ff;
  --brand-primary-300: #d8b4fe;
  --brand-primary-400: #c084fc;
  --brand-primary-500: #a855f7;  /* Main brand color */
  --brand-primary-600: #9333ea;
  --brand-primary-700: #7e22ce;
  --brand-primary-800: #6b21a8;
  --brand-primary-900: #581c87;

  /* Map to TouchX UI tokens */
  --tx-color-primary: var(--brand-primary-500);
  --tx-color-primary-hover: var(--brand-primary-600);
  --tx-color-primary-active: var(--brand-primary-700);
  --tx-color-primary-light: var(--brand-primary-100);
  --tx-color-primary-dark: var(--brand-primary-800);
}
```

### 2. Create Theme Variants

**Light Theme**:
```css
[data-theme="light"] {
  --tx-color-background: #ffffff;
  --tx-color-surface: #f8fafc;
  --tx-color-text-primary: #1e293b;
  --tx-color-text-secondary: #64748b;
  --tx-color-border: #e2e8f0;
  --tx-shadow-color: rgba(0, 0, 0, 0.1);
}
```

**Dark Theme**:
```css
[data-theme="dark"] {
  --tx-color-background: #0f172a;
  --tx-color-surface: #1e293b;
  --tx-color-text-primary: #f1f5f9;
  --tx-color-text-secondary: #cbd5e1;
  --tx-color-border: #334155;
  --tx-shadow-color: rgba(0, 0, 0, 0.3);
  
  /* Adjust primary colors for dark theme */
  --tx-color-primary: var(--brand-primary-400);
  --tx-color-primary-hover: var(--brand-primary-300);
}
```

**High Contrast Theme**:
```css
[data-theme="high-contrast"] {
  --tx-color-background: #000000;
  --tx-color-surface: #1a1a1a;
  --tx-color-text-primary: #ffffff;
  --tx-color-text-secondary: #cccccc;
  --tx-color-primary: #00ff00;
  --tx-color-border: #ffffff;
  --tx-focus-ring-width: 3px;
  --tx-focus-ring-color: #ffff00;
}
```

### 3. Theme Switching Implementation

**Vue Theme Provider**:
```vue
<template>
  <div :data-theme="currentTheme" class="app">
    <header class="app-header">
      <h1>My App</h1>
      <TxButton @click="toggleTheme">
        {{ currentTheme === 'light' ? '🌙' : '☀️' }}
      </TxButton>
    </header>
    
    <main class="app-content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'

const currentTheme = ref('light')

const toggleTheme = () => {
  currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light'
}

// Persist theme preference
watch(currentTheme, (newTheme) => {
  localStorage.setItem('theme', newTheme)
  document.documentElement.setAttribute('data-theme', newTheme)
}, { immediate: true })

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  currentTheme.value = savedTheme || systemTheme
})
</script>
```

**React Theme Hook**:
```jsx
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme')
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    const initialTheme = savedTheme || systemTheme
    
    setTheme(initialTheme)
    document.documentElement.setAttribute('data-theme', initialTheme)
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
```

## Advanced Theming

### 1. Dynamic Color Generation

```javascript
// Generate color palette from single color
function generateColorPalette(baseColor) {
  const hsl = hexToHsl(baseColor)
  
  return {
    50: hslToHex(hsl.h, hsl.s, 95),
    100: hslToHex(hsl.h, hsl.s, 90),
    200: hslToHex(hsl.h, hsl.s, 80),
    300: hslToHex(hsl.h, hsl.s, 70),
    400: hslToHex(hsl.h, hsl.s, 60),
    500: baseColor, // Original color
    600: hslToHex(hsl.h, hsl.s, 40),
    700: hslToHex(hsl.h, hsl.s, 30),
    800: hslToHex(hsl.h, hsl.s, 20),
    900: hslToHex(hsl.h, hsl.s, 10),
  }
}

// Apply generated palette
function applyBrandColors(brandColor) {
  const palette = generateColorPalette(brandColor)
  const root = document.documentElement
  
  Object.entries(palette).forEach(([shade, color]) => {
    root.style.setProperty(`--brand-primary-${shade}`, color)
  })
}
```

### 2. CSS-in-JS Theming

**Styled Components**:
```jsx
import styled, { ThemeProvider } from 'styled-components'

const theme = {
  colors: {
    primary: '#a855f7',
    primaryHover: '#9333ea',
    background: '#ffffff',
    text: '#1e293b',
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.5rem',
    lg: '0.75rem',
  }
}

const StyledButton = styled.button`
  background: ${props => props.theme.colors.primary};
  color: white;
  padding: ${props => props.theme.spacing.sm} ${props => props.theme.spacing.md};
  border-radius: ${props => props.theme.borderRadius.md};
  border: none;
  cursor: pointer;
  
  &:hover {
    background: ${props => props.theme.colors.primaryHover};
  }
`

function App() {
  return (
    <ThemeProvider theme={theme}>
      <StyledButton>Themed Button</StyledButton>
    </ThemeProvider>
  )
}
```

### 3. Runtime Theme Customization

```vue
<template>
  <div class="theme-customizer">
    <h3>Customize Theme</h3>
    
    <div class="control-group">
      <label>Primary Color</label>
      <input 
        type="color" 
        v-model="customTheme.primaryColor"
        @input="updateTheme"
      />
    </div>
    
    <div class="control-group">
      <label>Border Radius</label>
      <input 
        type="range" 
        min="0" 
        max="20" 
        v-model="customTheme.borderRadius"
        @input="updateTheme"
      />
      <span>{{ customTheme.borderRadius }}px</span>
    </div>
    
    <div class="control-group">
      <label>Font Size</label>
      <select v-model="customTheme.fontSize" @change="updateTheme">
        <option value="14">Small</option>
        <option value="16">Medium</option>
        <option value="18">Large</option>
      </select>
    </div>
    
    <TxButton @click="resetTheme">Reset to Default</TxButton>
  </div>
</template>

<script setup>
import { reactive } from 'vue'

const customTheme = reactive({
  primaryColor: '#3b82f6',
  borderRadius: 8,
  fontSize: 16
})

function updateTheme() {
  const root = document.documentElement
  
  root.style.setProperty('--tx-color-primary', customTheme.primaryColor)
  root.style.setProperty('--tx-radius-base', `${customTheme.borderRadius}px`)
  root.style.setProperty('--tx-text-base', `${customTheme.fontSize}px`)
  
  // Save to localStorage
  localStorage.setItem('customTheme', JSON.stringify(customTheme))
}

function resetTheme() {
  customTheme.primaryColor = '#3b82f6'
  customTheme.borderRadius = 8
  customTheme.fontSize = 16
  updateTheme()
}
</script>
```

## Theme Testing

### Accessibility Testing
```css
/* Test high contrast */
@media (prefers-contrast: high) {
  :root {
    --tx-color-primary: #0066cc;
    --tx-color-text-primary: #000000;
    --tx-color-background: #ffffff;
    --tx-border-width: 2px;
  }
}

/* Test reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

### Color Contrast Validation
```javascript
// Check WCAG contrast ratios
function getContrastRatio(color1, color2) {
  const l1 = getLuminance(color1)
  const l2 = getLuminance(color2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  
  return (lighter + 0.05) / (darker + 0.05)
}

function validateThemeContrast(theme) {
  const textOnBackground = getContrastRatio(theme.textColor, theme.backgroundColor)
  const primaryOnBackground = getContrastRatio(theme.primaryColor, theme.backgroundColor)
  
  return {
    textContrast: textOnBackground >= 4.5, // WCAG AA
    primaryContrast: primaryOnBackground >= 3.0, // WCAG AA Large
  }
}
```

## Best Practices

### Do's ✅
- Use semantic color names instead of specific colors
- Test themes in different lighting conditions
- Ensure sufficient contrast ratios
- Provide theme persistence
- Support system theme preferences
- Test with assistive technologies

### Don'ts ❌
- Don't hardcode colors in components
- Don't ignore accessibility requirements
- Don't create too many theme variants
- Don't break component functionality with extreme customizations
- Don't forget to test on different devices

### Performance Tips
- Use CSS custom properties for runtime changes
- Minimize the number of theme variables
- Leverage CSS cascade for inheritance
- Use `prefers-color-scheme` for automatic theme detection
- Cache theme preferences in localStorage

## Migration Guide

### From Other Libraries
```css
/* Material-UI to TouchX UI */
/* Before */
.MuiButton-root {
  background-color: #1976d2;
}

/* After */
.tx-button {
  --tx-button-background: #1976d2;
}
```

### Legacy CSS to Design Tokens
```css
/* Before: Hardcoded values */
.my-component {
  color: #333333;
  background: #ffffff;
  padding: 16px;
  border-radius: 8px;
}

/* After: Using design tokens */
.my-component {
  color: var(--tx-color-text-primary);
  background: var(--tx-color-background);
  padding: var(--tx-space-4);
  border-radius: var(--tx-radius-md);
}
```

This theming system provides the flexibility to create unique brand experiences while maintaining the accessibility, performance, and usability that TouchX UI is built on.
