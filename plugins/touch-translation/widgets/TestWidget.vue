<script setup lang="ts">
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import { ref } from 'vue'

/**
 * Test widget that demonstrates API injection
 * 测试 API 注入的 widget
 */

const message = ref('Hello from Widget! 🎉')
const count = ref(0)

function increment() {
  count.value++
}

// Test TuffItemBuilder API access
try {
  const builder = new TuffItemBuilder('test-widget')
  void builder
  message.value = '✅ API Access Working!'
}
catch (error) {
  void error
  message.value = '❌ API Access Failed'
}
</script>

<template>
  <div class="test-widget">
    <h2>{{ message }}</h2>
    <p>Count: {{ count }}</p>
    <button @click="increment">
      Increment
    </button>
  </div>
</template>

<style scoped>
.test-widget {
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  text-align: center;
}

.test-widget h2 {
  margin: 0 0 16px;
  font-size: 24px;
  font-weight: 600;
}

.test-widget p {
  margin: 12px 0;
  font-size: 18px;
}

.test-widget button {
  margin-top: 16px;
  padding: 10px 24px;
  background: rgba(255, 255, 255, 0.2);
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-radius: 8px;
  color: white;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.test-widget button:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.8);
  transform: translateY(-2px);
}
</style>
