<script setup lang="ts">
import TuffLogo from '../icon/Logo.vue'
import CoreBoxMock from '../mock/CoreBoxMock.vue'
import StarField from './StarField.vue'

// 定义一些状态来控制动画或交互
</script>

<template>
  <div class="relative w-full h-screen min-h-[900px] flex items-center justify-center overflow-hidden bg-[#020202] font-sans selection:bg-primary-500/30 selection:text-primary-200">
<!-- 1. 动态极光/星云背景 (底层) -->
    <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] bg-purple-900/20 rounded-full blur-[120px] mix-blend-screen animate-blob" />
        <div class="absolute top-[10%] right-[-10%] w-[60vw] h-[60vw] bg-blue-900/20 rounded-full blur-[100px] mix-blend-screen animate-blob animation-delay-2000" />
        <div class="absolute bottom-[-20%] left-[20%] w-[80vw] h-[60vw] bg-indigo-900/20 rounded-full blur-[130px] mix-blend-screen animate-blob animation-delay-4000" />
    </div>

    <!-- 2. 粒子星空 (中层) -->
    <ClientOnly>
      <StarField />
    </ClientOnly>

    <!-- 3. 点阵与网格纹理 (叠加层) -->
    <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-25 pointer-events-none mix-blend-overlay z-0" />
    <div class="absolute inset-0 bg-dot-pattern opacity-[0.2] pointer-events-none z-0 mask-radial-fade" />

    <!-- 底部透视网格 (Retro Grid Horizon) -->
    <div class="absolute bottom-0 left-0 right-0 h-[40vh] bg-grid-perspective opacity-20 pointer-events-none mask-linear-fade" />

    <!-- 4. 中心强光效 -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary-500/10 blur-[100px] rounded-full pointer-events-none mix-blend-screen animate-pulse-slow" />
    <div class="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[600px] bg-gradient-to-b from-primary-900/20 via-transparent to-transparent blur-[80px] pointer-events-none" />

    <!-- 3D Logo 背景 -->
    <div class="absolute inset-0 z-0 opacity-40 scale-125">
      <ClientOnly>
        <TuffLogo class="w-full h-full text-primary-900/20" />
      </ClientOnly>
    </div>

    <!-- 5. 主要内容区域 -->
    <div class="relative z-10 flex flex-col items-center gap-10 w-full max-w-5xl px-6">
<!-- 顶部徽章 -->
      <div class="group relative inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-white/90 backdrop-blur-md cursor-pointer hover:bg-white/10 transition-all duration-300 hover:border-white/20 hover:scale-105">
        <div class="absolute inset-0 rounded-full bg-primary-500/10 group-hover:bg-primary-500/20 transition-colors blur-lg" />
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
        </span>
        <span class="tracking-wide">Talex Touch 2.0 is now live</span>
        <div class="i-heroicons-arrow-right w-3 h-3 text-white/50 group-hover:text-white/80 group-hover:translate-x-0.5 transition-all" />
      </div>

      <!-- 标题文案 -->
      <div class="text-center space-y-6 max-w-4xl">
        <h1 class="text-6xl md:text-8xl font-bold tracking-tight text-white leading-[1.1] drop-shadow-2xl">
          <span class="block bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/40 pb-2">
            Architect the
          </span>
          <span class="block bg-clip-text text-transparent bg-gradient-to-b from-white via-primary-200 to-primary-600/50">
             future of software.
          </span>
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-2xl mx-auto font-light leading-relaxed">
          The integrated development environment designed for perfectionists.
          <br class="hidden md:block">
          Deploy instantly to the edge with zero configuration.
        </p>
      </div>

      <!-- CTA 按钮组 -->
      <div class="flex flex-col sm:flex-row gap-5 pt-4">
        <button class="group relative px-8 py-3.5 rounded-full bg-white text-black font-semibold text-sm transition-all hover:scale-105 hover:shadow-[0_0_25px_rgba(255,255,255,0.4)] flex items-center gap-2 overflow-hidden">
          <span class="relative z-10 flex items-center gap-2">
            Start Deploying
            <div class="i-heroicons-arrow-right w-4 h-4 transition-transform group-hover:translate-x-1" />
          </span>
          <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent -translate-x-full group-hover:animate-shimmer" />
        </button>
        <button class="group relative px-8 py-3.5 rounded-full bg-white/5 border border-white/10 text-white font-semibold text-sm backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/20 hover:scale-105 flex items-center gap-2">
          <div class="i-heroicons-play-circle w-5 h-5 text-primary-400 group-hover:text-primary-300 transition-colors" />
          Watch Demo
        </button>
      </div>

      <!-- CoreBox 展示容器 -->
      <div class="mt-12 transform-gpu perspective-1000 relative w-full flex justify-center">
        <!-- 底部光晕 -->
        <div class="absolute -bottom-20 left-1/2 -translate-x-1/2 w-[600px] h-[100px] bg-primary-500/30 blur-[60px] rounded-full pointer-events-none mix-blend-screen" />

        <div class="animate-float reflect-below relative">
           <!-- 外发光边框容器 -->
           <div class="absolute -inset-[1px] rounded-xl bg-gradient-to-b from-white/20 via-white/5 to-transparent blur-sm opacity-50" />
           <CoreBoxMock />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bg-dot-pattern {
  background-image: radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px);
  background-size: 32px 32px;
}

.mask-radial-fade {
  mask-image: radial-gradient(circle at center, black 0%, transparent 80%);
  -webkit-mask-image: radial-gradient(circle at center, black 0%, transparent 80%);
}

.mask-linear-fade {
  mask-image: linear-gradient(to top, black 0%, transparent 100%);
  -webkit-mask-image: linear-gradient(to top, black 0%, transparent 100%);
}

.bg-grid-perspective {
  background-image:
    linear-gradient(to right, rgba(255, 255, 255, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.05) 1px, transparent 1px);
  background-size: 40px 40px;
  transform: perspective(500px) rotateX(60deg);
  transform-origin: bottom center;
}

.perspective-1000 {
  perspective: 1000px;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) rotateX(2deg);
  }
  50% {
    transform: translateY(-15px) rotateX(4deg);
  }
}

.animate-float {
  animation: float 8s ease-in-out infinite;
}

.animate-pulse-slow {
  animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.reflect-below {
  -webkit-box-reflect: below 20px linear-gradient(to bottom, transparent 70%, rgba(255,255,255,0.1));
}

/* Blob animation */
@keyframes blob {
  0% {
    transform: translate(0px, 0px) scale(1);
  }
  33% {
    transform: translate(30px, -50px) scale(1.1);
  }
  66% {
    transform: translate(-20px, 20px) scale(0.9);
  }
  100% {
    transform: translate(0px, 0px) scale(1);
  }
}

.animate-blob {
  animation: blob 10s infinite;
}

.animation-delay-2000 {
  animation-delay: 2s;
}

.animation-delay-4000 {
  animation-delay: 4s;
}

/* Shimmer effect for button */
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 1.5s infinite;
}
</style>
