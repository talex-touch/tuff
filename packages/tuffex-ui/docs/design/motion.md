# Motion Language

TouchX UI's motion system creates lifelike, purposeful animations that enhance user experience through natural movement patterns. Our motion language is built on physics-based principles that make digital interactions feel tangible and responsive.

## Motion Philosophy

### Natural Physics
Every animation in TouchX UI follows real-world physics principles, creating movements that feel familiar and intuitive to users.

### Purposeful Animation
Motion serves a functional purpose - guiding attention, providing feedback, and creating smooth transitions between states.

### Emotional Resonance
Carefully crafted animations create emotional connections and delight users while maintaining professional polish.

## Core Principles

### 1. Easing Functions
Natural acceleration and deceleration curves that mimic real-world motion.

```css
/* TouchX UI Easing Curves */
--tx-ease-linear: linear;
--tx-ease-in: cubic-bezier(0.4, 0, 1, 1);
--tx-ease-out: cubic-bezier(0, 0, 0.2, 1);
--tx-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

/* Signature TouchX curves */
--tx-ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
--tx-ease-spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
--tx-ease-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
--tx-ease-crisp: cubic-bezier(0.25, 0.1, 0.25, 1);
```

### 2. Duration Scale
Consistent timing that creates rhythm and hierarchy.

```css
/* Duration Scale */
--tx-duration-instant: 0ms;      /* Immediate feedback */
--tx-duration-fast: 150ms;       /* Quick interactions */
--tx-duration-normal: 250ms;     /* Standard transitions */
--tx-duration-slow: 350ms;       /* Complex animations */
--tx-duration-slower: 500ms;     /* Page transitions */
--tx-duration-slowest: 750ms;    /* Hero animations */
```

### 3. Stagger Patterns
Orchestrated sequences that create visual flow.

```css
/* Stagger delays for list animations */
--tx-stagger-fast: 50ms;
--tx-stagger-normal: 100ms;
--tx-stagger-slow: 150ms;
```

## Animation Types

### Micro-Interactions
Subtle feedback for user actions.

<div class="motion-demo">
  <button class="demo-button micro-button">
    Hover Me
  </button>
</div>

```css
.micro-button {
  transition: all var(--tx-duration-fast) var(--tx-ease-out);
}

.micro-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.micro-button:active {
  transform: translateY(0);
  transition-duration: var(--tx-duration-instant);
}
```

### State Transitions
Smooth changes between component states.

<div class="motion-demo">
  <div class="demo-card state-card">
    <div class="card-content">
      <h4>Interactive Card</h4>
      <p>Hover to see state transition</p>
    </div>
    <div class="card-overlay">
      <button class="overlay-button">Learn More</button>
    </div>
  </div>
</div>

```css
.state-card {
  position: relative;
  overflow: hidden;
  transition: all var(--tx-duration-normal) var(--tx-ease-out);
}

.card-overlay {
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translateY(100%);
  transition: all var(--tx-duration-normal) var(--tx-ease-spring);
}

.state-card:hover .card-overlay {
  opacity: 1;
  transform: translateY(0);
}
```

### Loading Animations
Engaging feedback during wait times.

<div class="motion-demo">
  <div class="loading-demo">
    <div class="pulse-loader">
      <div class="pulse-dot"></div>
      <div class="pulse-dot"></div>
      <div class="pulse-dot"></div>
    </div>
  </div>
</div>

```css
.pulse-loader {
  display: flex;
  gap: 8px;
}

.pulse-dot {
  width: 12px;
  height: 12px;
  background: var(--tx-color-primary);
  border-radius: 50%;
  animation: pulse var(--tx-duration-slower) var(--tx-ease-in-out) infinite;
}

.pulse-dot:nth-child(2) {
  animation-delay: 150ms;
}

.pulse-dot:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes pulse {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}
```

## Advanced Animations

### Spring Physics
Natural bounce and elasticity effects.

```css
/* Spring animation keyframes */
@keyframes spring-in {
  0% {
    transform: scale(0.8) translateY(20px);
    opacity: 0;
  }
  50% {
    transform: scale(1.05) translateY(-5px);
    opacity: 0.8;
  }
  100% {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}

.spring-enter {
  animation: spring-in var(--tx-duration-slow) var(--tx-ease-spring);
}
```

### Morphing Transitions
Smooth shape and layout changes.

<div class="motion-demo">
  <div class="morph-demo">
    <div class="morph-shape"></div>
  </div>
</div>

```css
.morph-shape {
  width: 60px;
  height: 60px;
  background: var(--tx-color-primary);
  border-radius: 8px;
  transition: all var(--tx-duration-slow) var(--tx-ease-smooth);
  cursor: pointer;
}

.morph-shape:hover {
  width: 120px;
  height: 40px;
  border-radius: 20px;
  background: var(--tx-color-success);
}
```

### Staggered Animations
Orchestrated sequences for lists and grids.

```vue
<template>
  <div class="stagger-container">
    <div 
      v-for="(item, index) in items" 
      :key="item.id"
      class="stagger-item"
      :style="{ animationDelay: `${index * 100}ms` }"
    >
      {{ item.title }}
    </div>
  </div>
</template>

<style scoped>
.stagger-item {
  opacity: 0;
  transform: translateY(20px);
  animation: stagger-in var(--tx-duration-normal) var(--tx-ease-out) forwards;
}

@keyframes stagger-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
```

## Gesture-Based Animations

### Touch Interactions
Responsive animations that follow touch input.

```css
/* Touch ripple effect */
.touch-ripple {
  position: relative;
  overflow: hidden;
}

.touch-ripple::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: translate(-50%, -50%);
  transition: width var(--tx-duration-normal) var(--tx-ease-out),
              height var(--tx-duration-normal) var(--tx-ease-out);
}

.touch-ripple:active::after {
  width: 200px;
  height: 200px;
}
```

### Drag and Drop
Smooth feedback during drag operations.

```css
.draggable {
  transition: transform var(--tx-duration-fast) var(--tx-ease-out);
  cursor: grab;
}

.draggable:active {
  cursor: grabbing;
  transform: scale(1.05) rotate(2deg);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
  z-index: 1000;
}

.drag-ghost {
  opacity: 0.5;
  transform: scale(0.95);
}
```

## Performance Optimization

### Hardware Acceleration
Leverage GPU for smooth animations.

```css
/* Enable hardware acceleration */
.animated-element {
  transform: translate3d(0, 0, 0);
  will-change: transform, opacity;
}

/* Clean up after animation */
.animation-complete {
  will-change: auto;
}
```

### Reduced Motion Support
Respect user accessibility preferences.

```css
/* Respect reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  .parallax,
  .auto-scroll {
    animation-play-state: paused !important;
  }
}
```

## Implementation Examples

### Vue Transition Components
```vue
<template>
  <transition name="tx-fade" mode="out-in">
    <component :is="currentComponent" :key="componentKey" />
  </transition>
</template>

<style scoped>
.tx-fade-enter-active {
  transition: all var(--tx-duration-normal) var(--tx-ease-out);
}

.tx-fade-leave-active {
  transition: all var(--tx-duration-fast) var(--tx-ease-in);
}

.tx-fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.tx-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
```

### React Framer Motion
```jsx
import { motion } from 'framer-motion'

const springConfig = {
  type: "spring",
  damping: 20,
  stiffness: 300
}

export const AnimatedCard = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={springConfig}
    whileHover={{ y: -4 }}
    whileTap={{ scale: 0.98 }}
  >
    {children}
  </motion.div>
)
```

## Best Practices

### Do's ✅
- Use consistent easing curves throughout the interface
- Provide immediate feedback for user interactions
- Respect user motion preferences
- Test animations on various devices and browsers
- Use hardware acceleration for complex animations

### Don'ts ❌
- Don't overuse animations - they should enhance, not distract
- Don't ignore performance implications
- Don't use jarring or unnatural motion curves
- Don't animate too many properties simultaneously
- Don't forget to provide reduced motion alternatives

<style scoped>
.motion-demo {
  margin: 2rem 0;
  padding: 2rem;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
}

.demo-button {
  padding: 12px 24px;
  background: var(--vp-c-brand);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms cubic-bezier(0, 0, 0.2, 1);
}

.demo-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.demo-button:active {
  transform: translateY(0);
  transition-duration: 0ms;
}

.demo-card {
  width: 200px;
  height: 120px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: all 250ms cubic-bezier(0, 0, 0.2, 1);
}

.card-content {
  padding: 20px;
}

.card-content h4 {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
}

.card-content p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.card-overlay {
  position: absolute;
  inset: 0;
  background: rgba(59, 130, 246, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translateY(100%);
  transition: all 250ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.demo-card:hover .card-overlay {
  opacity: 1;
  transform: translateY(0);
}

.overlay-button {
  background: white;
  color: var(--vp-c-brand);
  border: none;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
}

.loading-demo {
  display: flex;
  justify-content: center;
}

.pulse-loader {
  display: flex;
  gap: 8px;
}

.pulse-dot {
  width: 12px;
  height: 12px;
  background: var(--vp-c-brand);
  border-radius: 50%;
  animation: pulse 500ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}

.pulse-dot:nth-child(2) {
  animation-delay: 150ms;
}

.pulse-dot:nth-child(3) {
  animation-delay: 300ms;
}

@keyframes pulse {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.morph-demo {
  display: flex;
  justify-content: center;
}

.morph-shape {
  width: 60px;
  height: 60px;
  background: var(--vp-c-brand);
  border-radius: 8px;
  transition: all 350ms cubic-bezier(0.25, 0.46, 0.45, 0.94);
  cursor: pointer;
}

.morph-shape:hover {
  width: 120px;
  height: 40px;
  border-radius: 20px;
  background: var(--vp-c-green);
}
</style>
