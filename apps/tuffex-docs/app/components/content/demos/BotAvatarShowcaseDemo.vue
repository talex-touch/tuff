<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const working = ref(true)

const copy = computed(() => (locale.value === 'zh'
  ? {
      types: '体型',
      sizes: '尺寸',
      states: '状态',
      idle: '空闲',
      working: '工作中',
      roster: '智能体名册',
      hint: '点击任意头像会让它跳一下并转身；指针靠近时眼睛会跟随。',
    }
  : {
      types: 'Body types',
      sizes: 'Sizes',
      states: 'States',
      idle: 'Idle',
      working: 'Working',
      roster: 'Agent roster',
      hint: 'Clicking an avatar makes it hop and turn; its eyes follow a nearby pointer.',
    }))

const TYPES = ['clover', 'flower', 'star', 'ghost', 'mech', 'circle', 'hexagon', 'square'] as const
const ROSTER = [
  { type: 'clover', name: 'Clover', busy: true },
  { type: 'mech', name: 'Mech', busy: false },
  { type: 'star', name: 'Star', busy: true },
  { type: 'hexagon', name: 'Hexagon', busy: false },
] as const
</script>

<template>
  <TxFlex direction="column" gap="24px" class="bot-avatar-demo">
    <TxFlex direction="column" gap="10px">
      <span class="bot-avatar-demo__label">{{ copy.types }}</span>
      <TxFlex align="center" gap="16px" wrap="wrap">
        <TxBotAvatar
          v-for="type in TYPES"
          :key="type"
          :type="type"
          :state="working ? 'working' : 'default'"
          :size="64"
        />
      </TxFlex>
    </TxFlex>

    <TxFlex direction="column" gap="10px">
      <span class="bot-avatar-demo__label">{{ copy.sizes }}</span>
      <TxFlex align="center" gap="16px">
        <TxBotAvatar type="clover" :size="96" />
        <TxBotAvatar type="clover" :size="64" />
        <TxBotAvatar type="clover" :size="32" />
      </TxFlex>
    </TxFlex>

    <TxFlex direction="column" gap="10px">
      <span class="bot-avatar-demo__label">{{ copy.states }}</span>
      <TxFlex align="center" gap="16px">
        <TxFlex direction="column" align="center" gap="6px">
          <TxBotAvatar type="star" state="default" :size="64" />
          <span class="bot-avatar-demo__hint">{{ copy.idle }}</span>
        </TxFlex>
        <TxFlex direction="column" align="center" gap="6px">
          <TxBotAvatar type="star" state="working" :size="64" />
          <span class="bot-avatar-demo__hint">{{ copy.working }}</span>
        </TxFlex>
        <TxSwitch v-model="working" />
      </TxFlex>
    </TxFlex>

    <TxFlex direction="column" gap="10px">
      <span class="bot-avatar-demo__label">{{ copy.roster }}</span>
      <TxFlex direction="column" gap="8px">
        <TxFlex v-for="agent in ROSTER" :key="agent.name" align="center" gap="10px">
          <TxBotAvatar :type="agent.type" :state="agent.busy ? 'working' : 'default'" :size="32" aria-hidden />
          <span>{{ agent.name }}</span>
          <span class="bot-avatar-demo__hint">{{ agent.busy ? copy.working : copy.idle }}</span>
        </TxFlex>
      </TxFlex>
    </TxFlex>

    <p class="bot-avatar-demo__hint">
      {{ copy.hint }}
    </p>
  </TxFlex>
</template>

<style scoped>
.bot-avatar-demo {
  padding: 20px 8px;
}

.bot-avatar-demo__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--tx-text-color-secondary);
}

.bot-avatar-demo__hint {
  font-size: 12px;
  color: var(--tx-text-color-secondary);
}
</style>
