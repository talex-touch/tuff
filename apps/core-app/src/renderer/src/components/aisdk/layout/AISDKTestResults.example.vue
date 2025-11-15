<template>
  <div class="p-8 space-y-4">
    <h2 class="text-2xl font-bold mb-4">AISDKTestResults Component Examples</h2>
    
    <!-- Success Example -->
    <div>
      <h3 class="text-lg font-semibold mb-2">Success State</h3>
      <AISDKTestResults
        v-if="showSuccess"
        :result="successResult"
        @dismiss="showSuccess = false"
      />
      <button
        v-else
        class="px-4 py-2 bg-blue-500 text-white rounded"
        @click="showSuccess = true"
      >
        Show Success Result
      </button>
    </div>

    <!-- Error Example -->
    <div>
      <h3 class="text-lg font-semibold mb-2">Error State</h3>
      <AISDKTestResults
        v-if="showError"
        :result="errorResult"
        @dismiss="showError = false"
      />
      <button
        v-else
        class="px-4 py-2 bg-blue-500 text-white rounded"
        @click="showError = true"
      >
        Show Error Result
      </button>
    </div>

    <!-- No Auto-Dismiss Example -->
    <div>
      <h3 class="text-lg font-semibold mb-2">No Auto-Dismiss</h3>
      <AISDKTestResults
        v-if="showPersistent"
        :result="successResult"
        :auto-dismiss="false"
        @dismiss="showPersistent = false"
      />
      <button
        v-else
        class="px-4 py-2 bg-blue-500 text-white rounded"
        @click="showPersistent = true"
      >
        Show Persistent Result
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import AISDKTestResults from './AISDKTestResults.vue'
import type { TestResult } from '~/types/aisdk'

const showSuccess = ref(false)
const showError = ref(false)
const showPersistent = ref(false)

const successResult: TestResult = {
  success: true,
  message: 'Successfully connected to OpenAI API',
  latency: 245,
  timestamp: Date.now()
}

const errorResult: TestResult = {
  success: false,
  message: 'Invalid API key provided',
  timestamp: Date.now()
}
</script>
