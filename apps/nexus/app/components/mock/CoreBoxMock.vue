<script setup lang="ts">
import { ref } from 'vue'

// 模拟状态
const searchValue = ref('')
const selectedIndex = ref(0)

const mockItems = [
  {
    icon: 'i-heroicons-window',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    title: 'Open Application',
    desc: 'System Command',
    action: 'Return'
  },
  {
    icon: 'i-heroicons-sparkles',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    title: 'Ask AI Assistant',
    desc: 'Tuff Intelligence',
    action: 'Return'
  },
  {
    icon: 'i-heroicons-document-text',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    title: 'Search Documents',
    desc: 'File System',
    action: 'Return'
  }
]
</script>

<template>
  <!-- 主容器：增加更深的背景和更细腻的边框 -->
  <div class="relative w-[720px] overflow-hidden rounded-xl bg-[#0a0a0a]/90 border border-white/[0.08] shadow-2xl backdrop-blur-2xl font-sans text-white ring-1 ring-white/[0.05]">
<!-- 顶部高光条 -->
    <div class="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

    <!-- 顶部搜索栏区域 -->
    <div class="flex items-center px-5 py-5 gap-4 relative">
      <!-- Logo -->
      <div class="w-9 h-9 flex items-center justify-center relative rounded-lg bg-white/5 border border-white/5 shadow-inner">
         <div class="i-heroicons-magnifying-glass w-5 h-5 text-white/70" />
      </div>

      <!-- 输入框 -->
      <div class="flex-1 flex items-center h-9 relative group">
        <span v-if="!searchValue" class="text-xl font-light text-white/20 absolute pointer-events-none transition-opacity group-hover:text-white/30">Type to search...</span>
        <div class="text-xl font-light text-white/90 cursor-text w-full bg-transparent border-none outline-none flex items-center absolute inset-0 font-mono tracking-tight">
            {{ searchValue }}
            <span class="animate-pulse inline-block w-[2px] h-6 bg-primary-400 ml-1 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
        </div>
      </div>

      <!-- 右侧图标/快捷键 -->
      <div class="flex items-center gap-3">
        <div class="px-2 py-1 rounded-md bg-white/5 text-[10px] text-white/40 font-mono border border-white/5 shadow-sm">
          Esc
        </div>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="h-[1px] w-full bg-white/[0.06]" />

    <!-- 内容区域 -->
    <div class="p-2 space-y-1">
      <div
        v-for="(item, index) in mockItems"
        :key="index"
        class="group flex items-center gap-4 px-3 py-3 rounded-lg cursor-pointer transition-all duration-200 border border-transparent"
        :class="index === selectedIndex ? 'bg-white/[0.08] border-white/[0.05] shadow-sm' : 'hover:bg-white/[0.04]'"
        @mouseenter="selectedIndex = index"
      >
        <div
            class="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 group-hover:scale-105 group-hover:shadow-lg"
            :class="[item.bg, item.color, index === selectedIndex ? 'ring-1 ring-white/10' : '']"
        >
          <div :class="[item.icon, 'w-5 h-5']" />
        </div>

        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-white/90 group-hover:text-white truncate">
            {{ item.title }}
          </div>
          <div class="text-xs text-white/40 group-hover:text-white/60 truncate mt-0.5">
            {{ item.desc }}
          </div>
        </div>

        <div
            class="text-[10px] px-2 py-0.5 rounded border border-white/10 text-white/30 transition-all duration-200 font-mono uppercase tracking-wider"
            :class="index === selectedIndex ? 'opacity-100 bg-white/5 text-white/50' : 'opacity-0'"
        >
          {{ item.action }}
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="bg-black/40 px-5 py-2.5 flex items-center justify-between text-[11px] text-white/30 border-t border-white/[0.06]">
      <div class="flex items-center gap-3">
        <span class="font-medium tracking-wide text-white/40">Talex Touch</span>
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500/80 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
          <span class="text-emerald-500/60">System Online</span>
        </div>
      </div>
      <div class="font-mono opacity-40">
v2.0.0-beta
</div>
    </div>
  </div>
</template>
