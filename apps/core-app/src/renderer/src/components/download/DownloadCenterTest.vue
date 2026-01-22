<script setup lang="ts">
import { DownloadModule, DownloadPriority } from '@talex-touch/utils'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { useDownloadCenter } from '~/modules/hooks/useDownloadCenter'
import DownloadCenter from './DownloadCenter.vue'

// 使用下载中心hook
const { addDownloadTask, getAllTasks } = useDownloadCenter()

// 测试结果
const testResults = ref('')

// 添加测试结果
function addTestResult(result: string) {
  testResults.value += `[${new Date().toLocaleTimeString()}] ${result}\n`
}

// 测试小文件下载
async function testSmallFile() {
  try {
    addTestResult('开始测试小文件下载...')

    const taskId = await addDownloadTask({
      url: 'https://httpbin.org/bytes/1024', // 1KB test file
      destination: '/tmp',
      filename: 'test-small-file.bin',
      priority: DownloadPriority.NORMAL,
      module: DownloadModule.USER_MANUAL,
      metadata: {
        testType: 'small-file',
        fileSize: 1024
      }
    })

    addTestResult(`样式文件下载任务已创建: ${taskId}`)
    toast.success('小文件下载测试已启动')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    addTestResult(`小文件下载测试失败: ${message}`)
    toast.error(`小文件下载测试失败: ${message}`)
  }
}

// 测试大文件下载
async function testLargeFile() {
  try {
    addTestResult('开始测试大文件下载...')

    const taskId = await addDownloadTask({
      url: 'https://httpbin.org/bytes/10485760', // 10MB test file
      destination: '/tmp',
      filename: 'test-large-file.bin',
      priority: DownloadPriority.NORMAL,
      module: DownloadModule.USER_MANUAL,
      metadata: {
        testType: 'large-file',
        fileSize: 10485760
      }
    })

    addTestResult(`大文件下载任务已创建: ${taskId}`)
    toast.success('大文件下载测试已启动')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    addTestResult(`大文件下载测试失败: ${message}`)
    toast.error(`大文件下载测试失败: ${message}`)
  }
}

// 测试并发下载
async function testConcurrentDownloads() {
  try {
    addTestResult('开始测试并发下载...')

    const tasks: string[] = []
    for (let i = 0; i < 5; i++) {
      const taskId = await addDownloadTask({
        url: `https://httpbin.org/bytes/1048576?index=${i}`, // 1MB test file
        destination: '/tmp',
        filename: `test-concurrent-${i}.bin`,
        priority: DownloadPriority.NORMAL,
        module: DownloadModule.USER_MANUAL,
        metadata: {
          testType: 'concurrent',
          index: i,
          fileSize: 1048576
        }
      })
      tasks.push(taskId)
    }

    addTestResult(`并发下载任务已创建: ${tasks.join(', ')}`)
    toast.success('并发下载测试已启动')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    addTestResult(`并发下载测试失败: ${message}`)
    toast.error(`并发下载测试失败: ${message}`)
  }
}

// 测试断点续传
async function testResumeDownload() {
  try {
    addTestResult('开始测试断点续传...')

    const taskId = await addDownloadTask({
      url: 'https://httpbin.org/bytes/5242880', // 5MB test file
      destination: '/tmp',
      filename: 'test-resume-file.bin',
      priority: DownloadPriority.HIGH,
      module: DownloadModule.USER_MANUAL,
      metadata: {
        testType: 'resume',
        fileSize: 5242880
      }
    })

    addTestResult(`断点续传下载任务已创建: ${taskId}`)
    toast.success('断点续传测试已启动')
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    addTestResult(`断点续传测试失败: ${message}`)
    toast.error(`断点续传测试失败: ${message}`)
  }
}

// 获取任务列表
async function testGetTasks() {
  try {
    addTestResult('获取任务列表...')

    const tasks = await getAllTasks()
    addTestResult(`当前任务数量: ${tasks.length}`)

    tasks.forEach((task) => {
      addTestResult(`- 任务 ${task.id}: ${task.filename} (${task.status})`)
    })

    toast.success(`获取到 ${tasks.length} 个任务`)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    addTestResult(`获取任务列表失败: ${message}`)
    toast.error(`获取任务列表失败: ${message}`)
  }
}
</script>

<template>
  <div class="download-center-test">
    <h2>下载中心测试</h2>

    <!-- 测试按钮 -->
    <div class="test-buttons">
      <el-button type="primary" @click="testSmallFile"> 测试小文件下载 </el-button>
      <el-button type="primary" @click="testLargeFile"> 测试大文件下载 </el-button>
      <el-button type="primary" @click="testConcurrentDownloads"> 测试并发下载 </el-button>
      <el-button type="primary" @click="testResumeDownload"> 测试断点续传 </el-button>
      <el-button type="success" @click="testGetTasks"> 获取任务列表 </el-button>
    </div>

    <!-- 测试结果 -->
    <div class="test-results">
      <h3>测试结果</h3>
      <pre>{{ testResults }}</pre>
    </div>

    <!-- 下载中心组件 -->
    <div class="download-center-container">
      <DownloadCenter />
    </div>
  </div>
</template>

<style scoped>
.download-center-test {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.test-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}

.test-results {
  margin-bottom: 24px;
}

.test-results h3 {
  margin-bottom: 12px;
}

.test-results pre {
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.download-center-container {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .test-buttons {
    flex-direction: column;
  }

  .test-buttons .el-button {
    width: 100%;
  }
}
</style>
