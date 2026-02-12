<script setup lang="ts">
import CoreBoxMock from '../mock/CoreBoxMock.vue'

// 定义一些状态来控制动画或交互
</script>

<template>
  <div class="relative w-full h-screen min-h-[800px] flex items-center justify-center overflow-hidden bg-[#050505]">
    <!-- 背景光效 -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[1000px] bg-primary-500/20 blur-[120px] rounded-full opacity-30 pointer-events-none mix-blend-screen animate-pulse-slow" />

    <!-- 3D 流体 Logo 背景 -->
    <!-- 我们把 TuffLogo 放在底层，放大并调整位置以作为环境背景 -->
    <div class="absolute inset-0 z-0 opacity-60 scale-125">
      <ClientOnly>
        <TuffLogo class="w-full h-full" />
      </ClientOnly>
    </div>

    <!-- 主要内容区域 -->
    <div class="relative z-10 flex flex-col items-center gap-12">
      <!-- 标题文案 -->
      <div class="text-center space-y-4">
        <h1 class="text-5xl md:text-7xl font-bold tracking-tight text-white">
          <span class="bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-white/50">
            Command Everything
          </span>
        </h1>
        <p class="text-xl text-white/60 max-w-2xl mx-auto font-light">
          The next-generation productivity powerhouse for your workflow.
        </p>
      </div>

      <!-- CoreBox 展示容器 -->
      <!-- 添加浮动动画和透视效果 -->
      <div class="transform-gpu perspective-1000">
        <div class="animate-float">
           <CoreBoxMock />
        </div>

        <!-- 倒影效果 -->
        <div class="absolute -bottom-12 left-0 right-0 h-24 bg-gradient-to-b from-white/5 to-transparent blur-xl opacity-30 transform scale-y-[-1] mask-image-gradient" />
      </div>

      <!-- CTA 按钮 -->
      <div class="flex gap-4">
        <UButton size="xl" color="white" variant="solid" class="px-8">
          Download Now
        </UButton>
        <UButton size="xl" color="gray" variant="ghost" class="px-8">
          View Documentation
        </UButton>
      </div>
    </div>

    <!-- 装饰性网格背景 -->
    <div class="absolute inset-0 bg-[url('/grid.svg')] opacity-10 pointer-events-none z-0" />
  </div>
</template>

<style scoped>
.perspective-1000 {
  perspective: 1000px;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) rotateX(2deg);
  }
  50% {
    transform: translateY(-20px) rotateX(5deg);
  }
}

.animate-float {
  animation: float 6s ease-in-out infinite;
}

.animate-pulse-slow {
  animation: pulse 8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
