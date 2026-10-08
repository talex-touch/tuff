<!-- Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN. -->
<script setup lang="ts">
defineProps<{ prefix: string }>()
</script>

<template>
  <defs>
    <pattern :id="`${prefix}-dot`" width="6" height="6" patternUnits="userSpaceOnUse">
      <circle cx="2" cy="2" r="1" fill="currentColor" opacity="0.55" />
      <circle cx="5" cy="5" r="0.75" fill="currentColor" opacity="0.3" />
    </pattern>
    <pattern :id="`${prefix}-hatched`" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0 0V8" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" opacity="0.5" />
    </pattern>
    <pattern :id="`${prefix}-duotone`" width="4" height="4" patternUnits="userSpaceOnUse">
      <path d="M0 0h2v2H0ZM2 2h2v2H2Z" fill="currentColor" opacity="0.5" />
    </pattern>
    <pattern :id="`${prefix}-striped`" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M0 3H6" stroke="currentColor" stroke-width="1.2" stroke-dasharray="1 1" opacity="0.45" />
    </pattern>
    <pattern :id="`${prefix}-dotted`" width="5" height="5" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="0.8" fill="currentColor" opacity="0.6" />
      <circle cx="4" cy="4" r="0.6" fill="currentColor" opacity="0.4" />
    </pattern>
    <pattern :id="`${prefix}-pixel`" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect x="0.5" y="0.5" width="3" height="3" fill="currentColor" />
    </pattern>
    <pattern :id="`${prefix}-ordered`" width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M0 0h2v2H0ZM4 0h2v2H4ZM2 2h2v2H2ZM6 2h2v2H6ZM0 4h2v2H0ZM4 4h2v2H4ZM2 6h2v2H2ZM6 6h2v2H6Z" fill="currentColor" />
    </pattern>
    <linearGradient :id="`${prefix}-area-gradient`" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="currentColor" stop-opacity="0.35" />
      <stop offset="60%" stop-color="currentColor" stop-opacity="0.08" />
      <stop offset="100%" stop-color="currentColor" stop-opacity="0" />
    </linearGradient>
    <linearGradient :id="`${prefix}-primary-gradient`" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="currentColor" stop-opacity="0.9" />
      <stop offset="50%" stop-color="currentColor" stop-opacity="0.7" />
      <stop offset="100%" stop-color="currentColor" stop-opacity="0.5" />
    </linearGradient>
    <filter :id="`${prefix}-noise`" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" seed="6" result="noise" />
      <feColorMatrix in="noise" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0.15 0" result="grain" />
      <feComposite in="grain" in2="SourceGraphic" operator="in" />
    </filter>
  </defs>
</template>
