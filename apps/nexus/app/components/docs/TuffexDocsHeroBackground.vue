<script setup lang="ts">
interface ShapeConfig {
  key: string
  tone: 'indigo' | 'rose' | 'violet' | 'amber' | 'cyan'
  positionClass: string
  delay: number
  width: number
  height: number
  rotate: number
}

const shapes: ShapeConfig[] = [
  {
    key: 'indigo-primary',
    tone: 'indigo',
    positionClass: 'is-indigo-primary',
    delay: 0.3,
    width: 600,
    height: 140,
    rotate: 12,
  },
  {
    key: 'rose-secondary',
    tone: 'rose',
    positionClass: 'is-rose-secondary',
    delay: 0.5,
    width: 500,
    height: 120,
    rotate: -15,
  },
  {
    key: 'violet-lower',
    tone: 'violet',
    positionClass: 'is-violet-lower',
    delay: 0.4,
    width: 300,
    height: 80,
    rotate: -8,
  },
  {
    key: 'amber-orbit',
    tone: 'amber',
    positionClass: 'is-amber-orbit',
    delay: 0.6,
    width: 200,
    height: 60,
    rotate: 20,
  },
  {
    key: 'cyan-spark',
    tone: 'cyan',
    positionClass: 'is-cyan-spark',
    delay: 0.7,
    width: 150,
    height: 40,
    rotate: -25,
  },
]

function getShapeStyle(shape: ShapeConfig) {
  return {
    '--shape-width': `${shape.width}px`,
    '--shape-height': `${shape.height}px`,
    '--shape-rotate': `${shape.rotate}deg`,
    '--shape-start-rotate': `${shape.rotate - 15}deg`,
    '--shape-delay': `${shape.delay}s`,
  }
}
</script>

<template>
  <div class="tuffex-docs-hero-bg" aria-hidden="true">
    <div class="tuffex-docs-hero-bg__wash" />
    <div class="tuffex-docs-hero-bg__shapes">
      <div
        v-for="shape in shapes"
        :key="shape.key"
        class="tuffex-docs-hero-bg__shape"
        :class="[`is-${shape.tone}`, shape.positionClass]"
        :style="getShapeStyle(shape)"
      >
        <div class="tuffex-docs-hero-bg__shape-float">
          <div class="tuffex-docs-hero-bg__shape-core" />
        </div>
      </div>
    </div>
    <div class="tuffex-docs-hero-bg__vignette" />
  </div>
</template>

<style scoped>
.tuffex-docs-hero-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: transparent;
  color: rgba(15, 23, 42, 0.92);
}

.tuffex-docs-hero-bg__wash {
  position: absolute;
  inset: -18%;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.045), transparent 42%, rgba(244, 63, 94, 0.045));
  filter: blur(72px);
}

.tuffex-docs-hero-bg__shapes {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.tuffex-docs-hero-bg__shape {
  position: absolute;
  opacity: 0;
  transform: translateY(-150px) rotate(var(--shape-start-rotate));
  animation: tuffex-docs-shape-enter 2.4s cubic-bezier(0.23, 0.86, 0.39, 0.96) var(--shape-delay) forwards;
}

.tuffex-docs-hero-bg__shape-float {
  position: relative;
  width: var(--shape-width);
  height: var(--shape-height);
  animation: tuffex-docs-shape-float 12s ease-in-out var(--shape-delay) infinite;
}

.tuffex-docs-hero-bg__shape-core {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 999px;
  background: linear-gradient(90deg, var(--shape-gradient), transparent);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  box-shadow: 0 18px 56px rgba(99, 102, 241, 0.1);
}

.tuffex-docs-hero-bg__shape-core::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.62), transparent 70%);
  content: '';
}

.tuffex-docs-hero-bg__shape.is-indigo {
  --shape-gradient: rgba(99, 102, 241, calc(0.14 * var(--tuffex-docs-hero-tone, 1)));
}

.tuffex-docs-hero-bg__shape.is-rose {
  --shape-gradient: rgba(244, 63, 94, calc(0.13 * var(--tuffex-docs-hero-tone, 1)));
}

.tuffex-docs-hero-bg__shape.is-violet {
  --shape-gradient: rgba(139, 92, 246, calc(0.12 * var(--tuffex-docs-hero-tone, 1)));
}

.tuffex-docs-hero-bg__shape.is-amber {
  --shape-gradient: rgba(245, 158, 11, calc(0.12 * var(--tuffex-docs-hero-tone, 1)));
}

.tuffex-docs-hero-bg__shape.is-cyan {
  --shape-gradient: rgba(6, 182, 212, calc(0.12 * var(--tuffex-docs-hero-tone, 1)));
}

.tuffex-docs-hero-bg__shape.is-indigo-primary {
  left: -22%;
  top: 16%;
}

.tuffex-docs-hero-bg__shape.is-rose-secondary {
  right: -18%;
  top: 68%;
}

.tuffex-docs-hero-bg__shape.is-violet-lower {
  bottom: 10%;
  left: -6%;
}

.tuffex-docs-hero-bg__shape.is-amber-orbit {
  right: 10%;
  top: 8%;
}

.tuffex-docs-hero-bg__shape.is-cyan-spark {
  left: 24%;
  top: 4%;
}

.tuffex-docs-hero-bg__vignette {
  display: none;
}

:global(.dark) .tuffex-docs-hero-bg,
:global([data-theme='dark']) .tuffex-docs-hero-bg {
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
}

:global(.dark) .tuffex-docs-hero-bg__wash,
:global([data-theme='dark']) .tuffex-docs-hero-bg__wash {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.04), transparent 44%, rgba(244, 63, 94, 0.04));
}

:global(.dark) .tuffex-docs-hero-bg__shape-core,
:global([data-theme='dark']) .tuffex-docs-hero-bg__shape-core {
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: 0 10px 34px rgba(255, 255, 255, 0.12);
}

:global(.dark) .tuffex-docs-hero-bg__shape-core::after,
:global([data-theme='dark']) .tuffex-docs-hero-bg__shape-core::after {
  background: radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.34), transparent 70%);
}


@media (min-width: 768px) {
  .tuffex-docs-hero-bg__shape.is-indigo-primary {
    left: -18%;
    top: 18%;
  }

  .tuffex-docs-hero-bg__shape.is-rose-secondary {
    right: -12%;
    top: 72%;
  }

  .tuffex-docs-hero-bg__shape.is-violet-lower {
    bottom: 12%;
    left: -3%;
  }

  .tuffex-docs-hero-bg__shape.is-amber-orbit {
    right: 15%;
    top: 12%;
  }

  .tuffex-docs-hero-bg__shape.is-cyan-spark {
    left: 28%;
    top: 7%;
  }
}

@media (max-width: 768px) {
  .tuffex-docs-hero-bg__shape-float {
    transform: scale(0.72);
    transform-origin: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .tuffex-docs-hero-bg__shape,
  .tuffex-docs-hero-bg__shape-float {
    animation: none;
  }

  .tuffex-docs-hero-bg__shape {
    opacity: 1;
    transform: translateY(0) rotate(var(--shape-rotate));
  }
}

@keyframes tuffex-docs-shape-enter {
  0% {
    opacity: 0;
    transform: translateY(-150px) rotate(var(--shape-start-rotate));
  }

  50% {
    opacity: 1;
  }

  100% {
    opacity: 1;
    transform: translateY(0) rotate(var(--shape-rotate));
  }
}

@keyframes tuffex-docs-shape-float {
  0%,
  100% {
    translate: 0 0;
  }

  50% {
    translate: 0 15px;
  }
}

</style>
