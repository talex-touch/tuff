<script setup lang="ts">
// 模拟 CoreBox 的外观组件
</script>

<template>
  <div class="relative w-[680px] overflow-hidden rounded-xl bg-[#1e1e1e]/80 border border-white/10 shadow-2xl backdrop-blur-xl font-sans text-white">
    <!-- 顶部搜索栏区域 -->
    <div class="flex items-center px-4 py-4 gap-3">
      <!-- Logo/Icon 占位 -->
      <div class="w-8 h-8 flex items-center justify-center">
         <div class="i-heroicons-magnifying-glass w-6 h-6 text-white/50" />
      </div>

      <!-- 输入框 -->
      <div class="flex-1 text-xl font-light text-white/90 cursor-text">
        Type to search...
        <span class="animate-pulse inline-block w-[2px] h-6 bg-primary-400 ml-0.5 align-middle" />
      </div>

      <!-- 右侧图标/快捷键 -->
      <div class="flex items-center gap-2">
        <div class="px-2 py-1 rounded bg-white/10 text-xs text-white/50 font-mono">
Esc
</div>
      </div>
    </div>

    <!-- 分割线 -->
    <div class="h-[1px] w-full bg-white/5" />

    <!-- 内容区域占位 -->
    <div class="p-2 space-y-1">
      <!-- 模拟结果项 -->
      <div class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
        <div class="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-400">
          <div class="i-heroicons-window w-5 h-5" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-medium">
Open Application
</div>
          <div class="text-xs text-white/40">
System Command
</div>
        </div>
        <div class="opacity-0 group-hover:opacity-100 text-xs text-white/30">
Return
</div>
      </div>

      <div class="group flex items-center gap-3 px-3 py-2 rounded-lg bg-white/10 cursor-pointer">
        <div class="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center text-purple-400">
          <div class="i-heroicons-sparkles w-5 h-5" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-medium">
Ask AI Assistant
</div>
          <div class="text-xs text-white/40">
Tuff Intelligence
</div>
        </div>
        <div class="text-xs text-white/30">
Return
</div>
      </div>

      <div class="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-pointer transition-colors">
        <div class="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center text-emerald-400">
          <div class="i-heroicons-document-text w-5 h-5" />
        </div>
        <div class="flex-1">
          <div class="text-sm font-medium">
Search Documents
</div>
          <div class="text-xs text-white/40">
File System
</div>
        </div>
      </div>
    </div>

    <!-- 底部状态栏 -->
    <div class="bg-black/20 px-4 py-2 flex items-center justify-between text-[10px] text-white/30 uppercase tracking-wider">
      <div class="flex items-center gap-2">
        <span>Talex Touch</span>
        <span class="w-1 h-1 rounded-full bg-white/20" />
        <span>Ready</span>
      </div>
      <div>v1.0.0</div>
    </div>
  </div>
</template>
