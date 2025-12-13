# Animation Guide

Animations in TouchX UI are more than visual flourishes - they're functional elements that guide users, provide feedback, and create emotional connections. This guide provides practical instructions for implementing TouchX UI's animation system effectively.

## Animation Fundamentals

### When to Animate

**✅ Use animations for**:
- **State transitions**: Button hover, form validation, loading states
- **Navigation**: Page transitions, modal appearances, drawer slides
- **Feedback**: Success confirmations, error alerts, progress indicators
- **Attention**: New content arrival, important notifications
- **Spatial relationships**: Element movement, layout changes

**❌ Avoid animations for**:
- Decorative purposes without functional value
- Critical actions that need immediate response
- Users with motion sensitivity (respect `prefers-reduced-motion`)
- Performance-critical contexts

### Animation Hierarchy

**Primary Animations** (250-350ms):
- Page transitions
- Modal appearances
- Major state changes

**Secondary Animations** (150-250ms):
- Component state changes
- Hover effects
- Focus indicators

**Micro Animations** (100-150ms):
- Button presses
- Toggle switches
- Small feedback indicators

## Implementation Patterns

### 1. Component State Animations

**Button Interactions**:
```vue
<template>
  <button class="tx-button" :class="{ 'is-loading': loading }">
    <span class="button-content" :class="{ 'is-hidden': loading }">
      {{ text }}
    </span>
    <div class="loading-spinner" :class="{ 'is-visible': loading }">
      <TxSpinner size="sm" />
    </div>
  </button>
</template>

<style scoped>
.tx-button {
  position: relative;
  transition: all var(--tx-duration-fast) var(--tx-ease-out);
  transform: translateY(0);
}

.tx-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.tx-button:active {
  transform: translateY(0);
  transition-duration: var(--tx-duration-instant);
}

.button-content {
  transition: opacity var(--tx-duration-fast) var(--tx-ease-out);
}

.button-content.is-hidden {
  opacity: 0;
}

.loading-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity var(--tx-duration-fast) var(--tx-ease-out);
}

.loading-spinner.is-visible {
  opacity: 1;
}
</style>
```

### 2. Layout Animations

**Expandable Content**:
```vue
<template>
  <div class="expandable-section">
    <button 
      class="section-header"
      @click="expanded = !expanded"
      :aria-expanded="expanded"
    >
      <span>{{ title }}</span>
      <TxIcon class="expand-icon" :class="{ 'is-expanded': expanded }">
        <ChevronDownIcon />
      </TxIcon>
    </button>
    
    <div class="section-content" :class="{ 'is-expanded': expanded }">
      <div class="content-inner">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps(['title'])
const expanded = ref(false)
</script>

<style scoped>
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: var(--tx-space-4);
  background: none;
  border: none;
  cursor: pointer;
  transition: background-color var(--tx-duration-fast) var(--tx-ease-out);
}

.section-header:hover {
  background-color: var(--tx-color-surface);
}

.expand-icon {
  transition: transform var(--tx-duration-normal) var(--tx-ease-out);
}

.expand-icon.is-expanded {
  transform: rotate(180deg);
}

.section-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height var(--tx-duration-normal) var(--tx-ease-out);
}

.section-content.is-expanded {
  max-height: 500px; /* Adjust based on content */
}

.content-inner {
  padding: 0 var(--tx-space-4) var(--tx-space-4);
}
</style>
```

### 3. List Animations

**Staggered Item Entrance**:
```vue
<template>
  <div class="animated-list">
    <div
      v-for="(item, index) in items"
      :key="item.id"
      class="list-item"
      :style="{ 
        animationDelay: `${index * 100}ms`,
        animationFillMode: 'both'
      }"
    >
      {{ item.title }}
    </div>
  </div>
</template>

<style scoped>
.list-item {
  opacity: 0;
  transform: translateY(20px);
  animation: slideInUp var(--tx-duration-normal) var(--tx-ease-out) forwards;
}

@keyframes slideInUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Alternative: CSS-only stagger */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 100ms; }
.list-item:nth-child(3) { animation-delay: 200ms; }
.list-item:nth-child(4) { animation-delay: 300ms; }
.list-item:nth-child(5) { animation-delay: 400ms; }
</style>
```

### 4. Modal and Overlay Animations

**Modal Entrance**:
```vue
<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div v-if="visible" class="modal-overlay" @click="handleOverlayClick">
        <div class="modal-content" @click.stop>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: var(--tx-radius-lg);
  box-shadow: var(--tx-shadow-xl);
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
}

/* Modal transitions */
.modal-enter-active {
  transition: opacity var(--tx-duration-normal) var(--tx-ease-out);
}

.modal-leave-active {
  transition: opacity var(--tx-duration-fast) var(--tx-ease-in);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .modal-content {
  transition: transform var(--tx-duration-normal) var(--tx-ease-spring);
}

.modal-leave-active .modal-content {
  transition: transform var(--tx-duration-fast) var(--tx-ease-in);
}

.modal-enter-from .modal-content {
  transform: scale(0.9) translateY(20px);
}

.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(-10px);
}
</style>
```

## Advanced Animation Techniques

### 1. Physics-Based Animations

**Spring Animation with CSS**:
```css
@keyframes springIn {
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
  animation: springIn var(--tx-duration-slow) var(--tx-ease-spring);
}
```

**Custom Spring with JavaScript**:
```javascript
// Using Web Animations API for more control
function springAnimation(element, from, to, config = {}) {
  const {
    tension = 300,
    friction = 20,
    duration = 500
  } = config;

  const keyframes = generateSpringKeyframes(from, to, tension, friction);
  
  return element.animate(keyframes, {
    duration,
    easing: 'linear',
    fill: 'forwards'
  });
}

// Usage
springAnimation(button, 
  { transform: 'scale(0.8)', opacity: 0 },
  { transform: 'scale(1)', opacity: 1 }
);
```

### 2. Gesture-Based Animations

**Touch Ripple Effect**:
```vue
<template>
  <button 
    class="ripple-button"
    @mousedown="createRipple"
    @touchstart="createRipple"
  >
    <span class="button-text">{{ text }}</span>
    <span 
      v-for="ripple in ripples" 
      :key="ripple.id"
      class="ripple"
      :style="ripple.style"
    />
  </button>
</template>

<script setup>
import { ref } from 'vue'

const ripples = ref([])

function createRipple(event) {
  const button = event.currentTarget;
  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;
  
  const ripple = {
    id: Date.now(),
    style: {
      width: `${size}px`,
      height: `${size}px`,
      left: `${x}px`,
      top: `${y}px`,
    }
  };
  
  ripples.value.push(ripple);
  
  // Remove ripple after animation
  setTimeout(() => {
    const index = ripples.value.findIndex(r => r.id === ripple.id);
    if (index > -1) ripples.value.splice(index, 1);
  }, 600);
}
</script>

<style scoped>
.ripple-button {
  position: relative;
  overflow: hidden;
  border: none;
  background: var(--tx-color-primary);
  color: white;
  padding: var(--tx-space-3) var(--tx-space-6);
  border-radius: var(--tx-radius-md);
  cursor: pointer;
}

.ripple {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0);
  animation: rippleEffect 600ms ease-out;
  pointer-events: none;
}

@keyframes rippleEffect {
  to {
    transform: scale(2);
    opacity: 0;
  }
}
</style>
```

### 3. Scroll-Based Animations

**Intersection Observer Animation**:
```vue
<template>
  <div ref="container" class="scroll-container">
    <div
      v-for="item in items"
      :key="item.id"
      class="scroll-item"
      :class="{ 'is-visible': item.isVisible }"
    >
      {{ item.content }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const container = ref(null)
const items = ref([
  { id: 1, content: 'Item 1', isVisible: false },
  { id: 2, content: 'Item 2', isVisible: false },
  { id: 3, content: 'Item 3', isVisible: false },
])

let observer = null

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        const index = parseInt(entry.target.dataset.index)
        items.value[index].isVisible = entry.isIntersecting
      })
    },
    { threshold: 0.1 }
  )

  // Observe all items
  container.value.querySelectorAll('.scroll-item').forEach((item, index) => {
    item.dataset.index = index
    observer.observe(item)
  })
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})
</script>

<style scoped>
.scroll-item {
  opacity: 0;
  transform: translateY(30px);
  transition: all var(--tx-duration-slow) var(--tx-ease-out);
}

.scroll-item.is-visible {
  opacity: 1;
  transform: translateY(0);
}
</style>
```

## Performance Optimization

### Hardware Acceleration
```css
/* Enable GPU acceleration */
.animated-element {
  transform: translate3d(0, 0, 0);
  will-change: transform, opacity;
}

/* Clean up after animation */
.animation-complete {
  will-change: auto;
}
```

### Efficient Animations
```css
/* Prefer transform and opacity over other properties */
.efficient-animation {
  /* Good: GPU accelerated */
  transition: transform 300ms ease-out, opacity 300ms ease-out;
}

.inefficient-animation {
  /* Avoid: Causes layout recalculation */
  transition: width 300ms ease-out, height 300ms ease-out;
}
```

### Reduced Motion Support
```css
/* Respect user preferences */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Testing Animations

### Manual Testing Checklist
- [ ] Animations run smoothly at 60fps
- [ ] No janky or stuttering motion
- [ ] Appropriate duration for the context
- [ ] Works across different devices and browsers
- [ ] Respects reduced motion preferences
- [ ] Provides clear feedback to users

### Automated Testing
```javascript
// Test animation completion
test('button animation completes', async () => {
  const button = screen.getByRole('button')
  
  fireEvent.mouseEnter(button)
  
  // Wait for animation to complete
  await waitFor(() => {
    expect(button).toHaveStyle('transform: translateY(-2px)')
  }, { timeout: 200 })
})
```

## Common Pitfalls

### Avoid These Mistakes
1. **Over-animating**: Too many simultaneous animations
2. **Wrong duration**: Too fast (jarring) or too slow (sluggish)
3. **Poor easing**: Linear animations feel robotic
4. **Layout thrashing**: Animating properties that cause reflow
5. **Ignoring accessibility**: Not respecting motion preferences

### Best Practices Summary
- Start with subtle animations and enhance gradually
- Use consistent timing and easing across components
- Test on lower-end devices for performance
- Provide immediate feedback for user actions
- Always include reduced motion alternatives

This guide provides the foundation for creating beautiful, functional animations in TouchX UI. Remember: great animations feel invisible - they enhance the experience without drawing attention to themselves.
