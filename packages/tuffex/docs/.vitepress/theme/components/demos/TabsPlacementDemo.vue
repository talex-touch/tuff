<script setup lang="ts">
import { ref } from 'vue'

const activeTop = ref('A')
const activeRight = ref('General')
const actionWide = ref(false)
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px; align-items: stretch;">
    <div style="height: 240px;">
      <TxTabs v-model="activeTop" placement="top" auto-width :animation="{ indicator: { durationMs: 220, easing: 'ease' } }">
        <TxTabHeader v-slot="{ props }">
          <div style="display: flex; align-items: center; width: 100%; padding: 10px 12px;">
            <div style="font-weight: 600;">
              {{ props.node?.props?.name }}
            </div>
          </div>
        </TxTabHeader>

        <template #nav-right>
          <TxButton size="small" type="primary" @click="actionWide = !actionWide">
            {{ actionWide ? 'More Actions' : 'Action' }}
          </TxButton>
        </template>

        <TxTabItem name="A" activation>
          <div style="padding: 8px;">
            Top - A
          </div>
        </TxTabItem>
        <TxTabItem name="B">
          <div style="padding: 8px;">
            Top - B
          </div>
        </TxTabItem>
        <TxTabItem name="C">
          <div style="padding: 8px;">
            Top - C
          </div>
        </TxTabItem>
      </TxTabs>
    </div>

    <div style="height: 240px;">
      <TxTabs v-model="activeRight" placement="right">
        <TxTabItem name="General" icon-class="i-carbon-settings" activation>
          <div style="padding: 8px;">
            Right - General
          </div>
        </TxTabItem>
        <TxTabItem name="Account" icon-class="i-carbon-user">
          <div style="padding: 8px;">
            Right - Account
          </div>
        </TxTabItem>
      </TxTabs>
    </div>
  </div>
</template>
