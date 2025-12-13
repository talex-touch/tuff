# Spacing System

TouchX UI's spacing system creates visual rhythm, hierarchy, and breathing room in interfaces. Built on a mathematical foundation, our spacing scale ensures consistency and harmony across all components and layouts.

## Spacing Philosophy

### Mathematical Harmony
Our spacing system is based on a **4px base unit**, creating a consistent rhythm that aligns perfectly with modern display densities and provides pixel-perfect layouts across all devices.

### Contextual Scaling
Spacing values are designed to work together, creating natural relationships between elements:
- **Micro spacing** for component internals
- **Macro spacing** for layout structure
- **Semantic spacing** for content relationships

## Base Unit System

### 4px Foundation
All spacing derives from a 4px base unit, ensuring perfect alignment and consistency.

<div class="spacing-scale">
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 1px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">px</span>
      <span class="spacing-value">1px</span>
      <span class="spacing-usage">Borders, dividers</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 4px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">1</span>
      <span class="spacing-value">4px</span>
      <span class="spacing-usage">Tight spacing, icons</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 8px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">2</span>
      <span class="spacing-value">8px</span>
      <span class="spacing-usage">Small gaps, padding</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 12px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">3</span>
      <span class="spacing-value">12px</span>
      <span class="spacing-usage">Form elements</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 16px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">4</span>
      <span class="spacing-value">16px</span>
      <span class="spacing-usage">Standard spacing</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 24px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">6</span>
      <span class="spacing-value">24px</span>
      <span class="spacing-usage">Component padding</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 32px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">8</span>
      <span class="spacing-value">32px</span>
      <span class="spacing-usage">Section spacing</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 48px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">12</span>
      <span class="spacing-value">48px</span>
      <span class="spacing-usage">Large gaps</span>
    </div>
  </div>
  
  <div class="spacing-item">
    <div class="spacing-visual" style="width: 64px; height: 20px; background: #3b82f6;"></div>
    <div class="spacing-info">
      <span class="spacing-name">16</span>
      <span class="spacing-value">64px</span>
      <span class="spacing-usage">Layout spacing</span>
    </div>
  </div>
</div>

## Complete Spacing Scale

### CSS Custom Properties
```css
:root {
  /* Base spacing scale */
  --tx-space-px: 1px;
  --tx-space-0: 0;
  --tx-space-1: 0.25rem;   /* 4px */
  --tx-space-2: 0.5rem;    /* 8px */
  --tx-space-3: 0.75rem;   /* 12px */
  --tx-space-4: 1rem;      /* 16px */
  --tx-space-5: 1.25rem;   /* 20px */
  --tx-space-6: 1.5rem;    /* 24px */
  --tx-space-7: 1.75rem;   /* 28px */
  --tx-space-8: 2rem;      /* 32px */
  --tx-space-9: 2.25rem;   /* 36px */
  --tx-space-10: 2.5rem;   /* 40px */
  --tx-space-11: 2.75rem;  /* 44px */
  --tx-space-12: 3rem;     /* 48px */
  --tx-space-14: 3.5rem;   /* 56px */
  --tx-space-16: 4rem;     /* 64px */
  --tx-space-20: 5rem;     /* 80px */
  --tx-space-24: 6rem;     /* 96px */
  --tx-space-28: 7rem;     /* 112px */
  --tx-space-32: 8rem;     /* 128px */
}
```

## Semantic Spacing

### Component-Level Spacing
Purpose-driven spacing tokens for consistent component design.

```css
/* Button spacing */
--tx-button-padding-x: var(--tx-space-4);      /* 16px */
--tx-button-padding-y: var(--tx-space-2);      /* 8px */
--tx-button-gap: var(--tx-space-2);            /* 8px */

/* Card spacing */
--tx-card-padding: var(--tx-space-6);          /* 24px */
--tx-card-gap: var(--tx-space-4);              /* 16px */

/* Form spacing */
--tx-form-field-gap: var(--tx-space-4);        /* 16px */
--tx-form-group-gap: var(--tx-space-6);        /* 24px */
--tx-form-section-gap: var(--tx-space-8);      /* 32px */

/* Layout spacing */
--tx-layout-gutter: var(--tx-space-4);         /* 16px */
--tx-layout-section-gap: var(--tx-space-16);   /* 64px */
--tx-layout-page-padding: var(--tx-space-6);   /* 24px */
```

## Usage Patterns

### Micro Spacing (1-3)
For tight, internal component spacing.

<div class="spacing-demo micro-demo">
  <div class="demo-element" style="padding: 4px 8px; margin-right: 12px;">
    <span>Icon</span>
    <span style="margin-left: 4px;">Text</span>
  </div>
  <code>padding: var(--tx-space-1) var(--tx-space-2)</code>
</div>

### Standard Spacing (4-6)
For general component padding and gaps.

<div class="spacing-demo standard-demo">
  <div class="demo-element" style="padding: 16px 24px;">
    <span>Button Content</span>
  </div>
  <code>padding: var(--tx-space-4) var(--tx-space-6)</code>
</div>

### Macro Spacing (8-16)
For layout structure and section separation.

<div class="spacing-demo macro-demo">
  <div class="demo-section" style="padding: 32px; margin-bottom: 64px;">
    <h3>Section Title</h3>
    <p>Section content with proper spacing</p>
  </div>
  <code>padding: var(--tx-space-8); margin-bottom: var(--tx-space-16)</code>
</div>

## Responsive Spacing

### Breakpoint-Aware Spacing
Spacing adapts to different screen sizes for optimal layouts.

```css
/* Mobile-first responsive spacing */
.responsive-container {
  padding: var(--tx-space-4);
  gap: var(--tx-space-4);
}

@media (min-width: 768px) {
  .responsive-container {
    padding: var(--tx-space-6);
    gap: var(--tx-space-6);
  }
}

@media (min-width: 1024px) {
  .responsive-container {
    padding: var(--tx-space-8);
    gap: var(--tx-space-8);
  }
}
```

### Container Spacing
```css
/* Container max-widths with appropriate padding */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--tx-space-4);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--tx-space-6);
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 0 var(--tx-space-8);
  }
}
```

## Layout Examples

### Card Layout
```vue
<template>
  <div class="card-layout">
    <div class="card">
      <div class="card-header">
        <h3>Card Title</h3>
        <button class="card-action">Action</button>
      </div>
      <div class="card-content">
        <p>Card content with proper spacing relationships.</p>
      </div>
      <div class="card-footer">
        <button class="btn-secondary">Cancel</button>
        <button class="btn-primary">Confirm</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  background: white;
  border-radius: var(--tx-radius-lg);
  box-shadow: var(--tx-shadow-md);
  overflow: hidden;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--tx-space-6);
  border-bottom: 1px solid var(--tx-color-border);
  gap: var(--tx-space-4);
}

.card-content {
  padding: var(--tx-space-6);
}

.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--tx-space-3);
  padding: var(--tx-space-6);
  background: var(--tx-color-surface);
  border-top: 1px solid var(--tx-color-border);
}
</style>
```

### Form Layout
```vue
<template>
  <form class="form-layout">
    <div class="form-group">
      <label class="form-label">Name</label>
      <input class="form-input" type="text" />
    </div>
    
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-input" type="email" />
    </div>
    
    <div class="form-actions">
      <button type="button" class="btn-secondary">Cancel</button>
      <button type="submit" class="btn-primary">Submit</button>
    </div>
  </form>
</template>

<style scoped>
.form-layout {
  display: flex;
  flex-direction: column;
  gap: var(--tx-space-6);
  max-width: 400px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--tx-space-2);
}

.form-label {
  font-weight: 500;
  color: var(--tx-text-primary);
}

.form-input {
  padding: var(--tx-space-3) var(--tx-space-4);
  border: 1px solid var(--tx-color-border);
  border-radius: var(--tx-radius-md);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--tx-space-3);
  margin-top: var(--tx-space-4);
}
</style>
```

## Best Practices

### Do's ✅
- Use the spacing scale consistently
- Maintain vertical rhythm with consistent spacing
- Use semantic spacing tokens for components
- Consider responsive spacing needs
- Test spacing on different screen sizes

### Don'ts ❌
- Don't use arbitrary spacing values
- Don't mix different spacing systems
- Don't ignore the base 4px grid
- Don't use the same spacing for all contexts
- Don't forget about responsive considerations

<style scoped>
.spacing-scale {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 2rem 0;
}

.spacing-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}

.spacing-visual {
  flex-shrink: 0;
}

.spacing-info {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex: 1;
}

.spacing-name {
  font-family: monospace;
  font-weight: 600;
  min-width: 30px;
}

.spacing-value {
  font-family: monospace;
  color: var(--vp-c-text-2);
  min-width: 50px;
}

.spacing-usage {
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}

.spacing-demo {
  margin: 1.5rem 0;
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}

.demo-element {
  display: inline-flex;
  align-items: center;
  background: var(--vp-c-brand);
  color: white;
  border-radius: 4px;
  font-size: 0.875rem;
}

.demo-section {
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}

code {
  display: block;
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
}
</style>
