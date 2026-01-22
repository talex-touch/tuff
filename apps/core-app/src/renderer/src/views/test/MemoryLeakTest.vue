<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'
import { createApp, ref } from 'vue'
import { useAuth } from '~/modules/auth/useAuth'

const componentStatus = ref('未创建')
const createCount = ref(0)
const destroyCount = ref(0)
const logs = ref<string[]>([])

let testApp: ReturnType<typeof createApp> | null = null

function addLog(message: string) {
  logs.value.push(`[${new Date().toLocaleTimeString()}] ${message}`)
  console.log(message)
}

function createComponent() {
  try {
    if (testApp) {
      addLog('警告: 组件已存在，先销毁旧组件')
      destroyComponent()
    }

    addLog('开始创建测试组件...')

    // 创建测试元素
    const element = document.createElement('div')
    element.id = 'memory-leak-test-component'
    element.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 300px;
      height: 200px;
      background: var(--el-bg-color);
      border: 1px solid var(--el-border-color);
      border-radius: 8px;
      padding: 20px;
      z-index: 9999;
    `

    // 创建测试组件
    const TestComponent = {
      components: { TxButton },
      setup() {
        const { isAuthenticated, isLoading, isLoggedIn, currentUser } = useAuth()

        addLog(`测试组件已挂载，认证状态: ${isAuthenticated.value}`)
        addLog(`测试组件已挂载，登录状态: ${isLoggedIn.value}`)

        return {
          isAuthenticated,
          isLoading,
          isLoggedIn,
          currentUser
        }
      },
      template: `
        <div>
          <h4>测试组件</h4>
          <p>认证状态: {{ isAuthenticated }}</p>
          <p>登录状态: {{ isLoggedIn() }}</p>
          <TxButton variant="flat" @click="close">关闭</TxButton>
        </div>
      `,
      methods: {
        close() {
          addLog('测试组件关闭按钮被点击')
          destroyComponent()
        }
      }
    }

    testApp = createApp(TestComponent)
    testApp.mount(element)
    document.body.appendChild(element)

    componentStatus.value = '已创建'
    createCount.value++
    addLog('测试组件创建成功')
  } catch (error) {
    addLog(`创建组件失败: ${error}`)
    console.error('Create component error:', error)
  }
}

function destroyComponent() {
  try {
    if (testApp) {
      addLog('开始销毁测试组件...')

      const element = document.getElementById('memory-leak-test-component')
      if (element) {
        testApp.unmount()
        document.body.removeChild(element)
        addLog('测试组件已从 DOM 中移除')
      }

      testApp = null
      componentStatus.value = '已销毁'
      destroyCount.value++
      addLog('测试组件销毁成功')

      // 等待一段时间后检查内存
      setTimeout(() => {
        addLog('内存检查: 组件应该已被完全清理')
      }, 1000)
    } else {
      addLog('没有可销毁的组件')
    }
  } catch (error) {
    addLog(`销毁组件失败: ${error}`)
    console.error('Destroy component error:', error)
  }
}

function clearLogs() {
  logs.value = []
  addLog('日志已清除')
}
</script>

<template>
  <div class="memory-leak-test">
    <h2>内存泄漏测试</h2>

    <div class="test-controls">
      <el-button type="primary" @click="createComponent"> 创建组件 </el-button>
      <el-button type="danger" @click="destroyComponent"> 销毁组件 </el-button>
      <el-button type="default" @click="clearLogs"> 清除日志 </el-button>
    </div>

    <div class="test-info">
      <p><strong>组件状态:</strong> {{ componentStatus }}</p>
      <p><strong>创建次数:</strong> {{ createCount }}</p>
      <p><strong>销毁次数:</strong> {{ destroyCount }}</p>
    </div>

    <div class="test-logs">
      <h3>测试日志</h3>
      <div class="logs-container">
        <div v-for="(log, index) in logs" :key="index" class="log-item">
          {{ log }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.memory-leak-test {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.test-controls {
  display: flex;
  gap: 12px;
  margin: 20px 0;
}

.test-info {
  background: var(--el-fill-color-light);
  padding: 16px;
  border-radius: 8px;
  margin: 20px 0;
}

.test-info p {
  margin: 4px 0;
  color: var(--el-text-color-primary);
}

.test-logs {
  margin-top: 30px;
}

.logs-container {
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.log-item {
  font-family: monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin: 2px 0;
  padding: 2px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.log-item:last-child {
  border-bottom: none;
}
</style>
