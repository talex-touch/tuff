<script setup lang="ts">
import type { MikoState } from '@talex-touch/tuffex'

const states: { state: MikoState, label: string }[] = [
  { state: 'idle', label: '待命 (Idle)' },
  { state: 'working', label: '踩奶敲代码 (Working)' },
  { state: 'thinking', label: '思考灵感 (Thinking)' },
  { state: 'running', label: '急步奔跑 (Running)' },
  { state: 'coffee', label: '品尝咖啡 (Coffee)' },
  { state: 'guitar', label: '弹奏吉他 (Guitar)' },
  { state: 'dj', label: 'DJ打碟 (DJ)' },
  { state: 'ninja', label: '忍者潜行 (Ninja)' },
  { state: 'magic', label: '施展魔法 (Magic)' },
  { state: 'chef', label: '料理大厨 (Chef)' },
  { state: 'fishing', label: '垂钓时光 (Fishing)' },
  { state: 'space', label: '太空宇航 (Space)' },
  { state: 'heart', label: '发射爱心 (Heart)' },
  { state: 'workout', label: '举重健身 (Workout)' },
  { state: 'umbrella', label: '雨中漫步 (Umbrella)' },
  { state: 'sleepy', label: '困倦呵欠 (Sleepy)' },
  { state: 'success', label: '任务成功 (Success)' },
  { state: 'demon', label: '闪光恶魔 (Demon)' },
  { state: 'alert', label: '权限警觉 (Alert)' },
  { state: 'error', label: '报错震颤 (Error)' },
  { state: 'sleeping', label: '休眠蜷缩 (Sleeping)' },
  { state: 'juggling', label: '多任务抛球 (Juggling)' },
  { state: 'sweeping', label: '扫地整理 (Sweeping)' },
  { state: 'reading', label: '代码研读 (Reading)' },
  { state: 'dizzy', label: '互动眩晕 (Dizzy)' },
  { state: 'peeking', label: '边栏探头 (Peeking)' },
  { state: 'stretching', label: '猫式伸展 (Stretching)' },
  { state: 'bathing', label: '舔爪洗脸 (Bathing)' },
  { state: 'curious', label: '好奇歪头 (Curious)' },
  { state: 'scratching', label: '磨爪挠挠 (Scratching)' },
  { state: 'purring', label: '呼噜发颤 (Purring)' },
  { state: 'eating', label: '吃小鱼干 (Eating)' },
  { state: 'dancing', label: '节拍摇摆 (Dancing)' },
  { state: 'cheering', label: '打call应援 (Cheering)' },
  { state: 'gaming', label: '专注打机 (Gaming)' },
  { state: 'hacking', label: '极客超频 (Hacking)' },
  { state: 'celebrating', label: '撒花庆祝 (Celebrating)' },
  { state: 'box', label: '纸箱猫猫 (Box)' },
]
</script>

<template>
  <div class="miko-states-demo">
    <div class="miko-states-demo__grid">
      <div v-for="item in states" :key="item.state" class="miko-states-demo__card">
        <TxMiko :state="item.state" size="md" />
        <span class="miko-states-demo__label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.miko-states-demo {
  padding: 16px;
}

.miko-states-demo__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}

.miko-states-demo__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 14px 6px;
  background: var(--tx-bg-color-overlay, rgba(255, 255, 255, 0.03));
  border: 1px solid var(--tx-border-color, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
}

.miko-states-demo__label {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #8b88a8);
  text-align: center;
}
</style>
