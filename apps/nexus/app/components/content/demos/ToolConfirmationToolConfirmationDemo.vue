<script setup lang="ts">
import { ref } from 'vue'

type Risk = 'read' | 'write' | 'execute'

const risk = ref<Risk>('write')
const decision = ref<string | null>(null)

const risks: Risk[] = ['read', 'write', 'execute']

const input = JSON.stringify({ path: 'src/main.ts', mode: 'overwrite' }, null, 2)

function onApprove({ remember }: { remember: boolean }) {
  decision.value = `approved${remember ? ' (remembered for the session)' : ''}`
}

// Deny carries `remember` too, so "deny for this session" is expressible.
function onDeny({ remember }: { remember: boolean }) {
  decision.value = `denied${remember ? ' (remembered for the session)' : ''}`
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap gap-2">
      <button
        v-for="level in risks"
        :key="level"
        type="button"
        class="rounded-lg border border-[var(--tx-border-color)] px-3 py-1 text-sm"
        :class="risk === level ? 'bg-[var(--tx-fill-color)]' : ''"
        @click="risk = level; decision = null"
      >
        {{ level }}
      </button>
    </div>

    <TxToolConfirmation
      :key="risk"
      tool-name="write_file"
      :risk="risk"
      summary="Will rewrite src/main.ts in place."
      :input="input"
      @approve="onApprove"
      @deny="onDeny"
    />

    <p class="text-sm text-[var(--tx-text-color-secondary)]">
      <template v-if="decision">
        Host received: <code>{{ decision }}</code>
      </template>
      <template v-else>
        The card only reports a decision — nothing runs.
      </template>
    </p>
  </div>
</template>
