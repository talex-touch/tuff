<script setup lang="ts">
defineProps<{ color: string }>()
</script>

<template>
  <g class="cat-demon">
    <!-- 恶魔小蝙蝠翅膀 -->
    <g class="demon-wing-l">
      <rect x="1" y="5" width="2" height="2" fill="#EF4444" />
      <rect x="2" y="7" width="3" height="4" fill="#18181B" />
      <rect x="0" y="8" width="2" height="2" fill="#EF4444" />
    </g>
    <g class="demon-wing-r">
      <rect x="21" y="5" width="2" height="2" fill="#EF4444" />
      <rect x="19" y="7" width="3" height="4" fill="#18181B" />
      <rect x="22" y="8" width="2" height="2" fill="#EF4444" />
    </g>
    <!-- 恶魔小叉尾 -->
    <g class="demon-tail">
      <rect x="22" y="10" width="4" height="2" fill="#EF4444" />
      <rect x="25" y="8" width="2" height="3" fill="#EF4444" />
      <polygon points="28,7 32,5 32,9" fill="#EF4444" />
    </g>
    <!-- 恶魔犄角 -->
    <g class="demon-horns">
      <rect x="4" y="3" width="2" height="3" fill="#EF4444" />
      <rect x="3" y="2" width="2" height="2" fill="#F43F5E" />
      <rect x="14" y="3" width="2" height="3" fill="#EF4444" />
      <rect x="15" y="2" width="2" height="2" fill="#F43F5E" />
    </g>
    <!-- 身体本体 (暗绯色/深紫) -->
    <rect x="5" y="6" width="2" height="2" :fill="color" />
    <rect x="13" y="6" width="2" height="2" :fill="color" />
    <rect x="4" y="7" width="4" height="2" :fill="color" />
    <rect x="12" y="7" width="4" height="2" :fill="color" />
    <rect x="3" y="8" width="14" height="2" :fill="color" />
    <rect x="3" y="9" width="17" height="2" :fill="color" />
    <rect x="2" y="10" width="20" height="2" :fill="color" />
    <rect x="2" y="11" width="21" height="2" :fill="color" />
    <rect x="2" y="12" width="22" height="3" :fill="color" />
    <rect x="3" y="15" width="20" height="2" :fill="color" />
    <!-- 邪魅发光金/红瞳 -->
    <g class="demon-eyes">
      <rect x="5" y="10" width="3" height="2" fill="#EF4444" />
      <rect x="6" y="10" width="1" height="2" fill="#FDE047" />
      <rect x="12" y="10" width="3" height="2" fill="#EF4444" />
      <rect x="13" y="10" width="1" height="2" fill="#FDE047" />
    </g>
    <!-- 小恶魔嘴角与小尖牙 -->
    <g class="demon-fangs">
      <rect x="7" y="13" width="6" height="1" fill="#000" />
      <rect x="8" y="14" width="1" height="2" fill="#fff" />
      <rect x="11" y="14" width="1" height="2" fill="#fff" />
    </g>
    <!-- 闪光恶魔星光 (金色与绯红粒子) -->
    <g class="demon-sparkles">
      <rect x="8" y="1" width="1" height="1" fill="#FDE047" />
      <rect x="18" y="1" width="2" height="2" fill="#F43F5E" />
      <rect x="2" y="12" width="1" height="1" fill="#FDE047" />
      <rect x="26" y="13" width="2" height="2" fill="#FDE047" />
    </g>
  </g>
</template>
