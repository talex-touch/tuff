<script setup lang="ts">
import { onMounted, ref } from 'vue'

const scrollAnimatedDone = ref(false)
const timeline = [
  { label: '09:18', title: 'User scrolls hero section', desc: 'Blur stays off while card is in view.' },
  { label: '09:19', title: 'Card leaves viewport', desc: 'IntersectionObserver fires and动画开启。' },
  { label: '09:20', title: 'Gradient settles', desc: 'CTA 背景被柔化，文本清晰可读。' },
]

function handleScrollAnimatedDone() {
  scrollAnimatedDone.value = true
  setTimeout(() => {
    scrollAnimatedDone.value = false
  }, 1400)
}

const illustrationDots = Array.from({ length: 28 })

onMounted(() => {
  const scroller = document.querySelector<HTMLDivElement>('.gradual-blur-animated-demo__scroll')
  if (!scroller) return

  const handleWheel = () => {
    if (scrollAnimatedDone.value) return
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' })
  }

  scroller.addEventListener('wheel', handleWheel, { passive: true })
})
</script>

<template>
  <div class="gradual-blur-animated-demo">
    <header class="gradual-blur-animated-demo__header">
      <div>
        <p class="gradual-blur-animated-demo__eyebrow">Animated scroll</p>
        <h4>Hero overlay enter / leave</h4>
      </div>
      <span class="gradual-blur-animated-demo__pill" :class="scrollAnimatedDone ? 'is-true' : ''">
        {{ scrollAnimatedDone ? 'blur active' : 'waiting' }}
      </span>
    </header>

    <section class="gradual-blur-animated-demo__section">
      <div class="gradual-blur-animated-demo__scroll">
        <article class="gradual-blur-animated-demo__card">
          <div class="gradual-blur-animated-demo__badge">Case study</div>
          <h5>Launch week spotlight</h5>
          <p>
            当用户滑过首屏时，底部的 CTA 区域被柔和模糊，自动避免背景图片干扰。
            IntersectionObserver 负责触发动画。
          </p>
          <div class="gradual-blur-animated-demo__gallery">
            <div v-for="(_, idx) in illustrationDots" :key="idx" class="gradual-blur-animated-demo__dot" />
          </div>
        </article>

        <ul class="gradual-blur-animated-demo__timeline">
          <li v-for="item in timeline" :key="item.label">
            <span class="time">{{ item.label }}</span>
            <div class="content">
              <strong>{{ item.title }}</strong>
              <p>{{ item.desc }}</p>
            </div>
          </li>
        </ul>

        <div class="gradual-blur-animated-demo__spacer">End.</div>
      </div>

      <TxGradualBlur
        position="bottom"
        height="6.5rem"
        :strength="2.4"
        :div-count="6"
        animated="scroll"
        duration="0.35s"
        easing="ease-out"
        :exponential="true"
        :hover-intensity="1.4"
        :on-animation-complete="handleScrollAnimatedDone"
      />
    </section>
  </div>
</template>

<style scoped>
.gradual-blur-animated-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: min(620px, 100%);
}

.gradual-blur-animated-demo__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.gradual-blur-animated-demo__eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 0 0 2px;
  color: var(--tx-text-color-placeholder);
}

.gradual-blur-animated-demo__header h4 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.gradual-blur-animated-demo__pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.02em;
  color: var(--tx-text-color-secondary);
  border: 1px dashed var(--tx-border-color);
  transition: all 0.2s ease;
}

.gradual-blur-animated-demo__pill.is-true {
  color: var(--tx-color-success);
  border-color: rgba(16, 185, 129, 0.5);
  background: rgba(16, 185, 129, 0.08);
}

.gradual-blur-animated-demo__section {
  position: relative;
  height: 280px;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--tx-border-color);
  background: radial-gradient(circle at 20% 20%, rgba(59, 130, 246, 0.16), transparent 60%);
}

.gradual-blur-animated-demo__scroll {
  height: 100%;
  overflow-y: auto;
  padding: 1.4rem 1.2rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.gradual-blur-animated-demo__card {
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);
}

.gradual-blur-animated-demo__badge {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 6px;
  color: rgba(15, 23, 42, 0.6);
}

.gradual-blur-animated-demo__card h5 {
  margin: 0 0 8px;
  font-size: 16px;
}

.gradual-blur-animated-demo__card p {
  color: rgba(15, 23, 42, 0.8);
  line-height: 1.5;
  margin: 0;
}

.gradual-blur-animated-demo__gallery {
  margin-top: 12px;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.gradual-blur-animated-demo__dot {
  width: 100%;
  padding-bottom: 100%;
  border-radius: 8px;
  background: linear-gradient(145deg, rgba(59, 130, 246, 0.45), rgba(125, 211, 252, 0.25));
}

.gradual-blur-animated-demo__timeline {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gradual-blur-animated-demo__timeline li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.gradual-blur-animated-demo__timeline .time {
  font-size: 12px;
  color: var(--tx-text-color-placeholder);
  min-width: 50px;
}

.gradual-blur-animated-demo__timeline .content {
  flex: 1;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(148, 163, 184, 0.4);
}

.gradual-blur-animated-demo__timeline strong {
  display: block;
  font-size: 14px;
  margin-bottom: 4px;
}

.gradual-blur-animated-demo__timeline p {
  margin: 0;
  color: var(--tx-text-color-secondary);
  line-height: 1.5;
}

.gradual-blur-animated-demo__spacer {
  margin-top: 30px;
  text-align: center;
  color: var(--tx-text-color-placeholder);
}
</style>
