import type { DownloadTask, QueueStatus } from '@talex-touch/utils'
import { DownloadPriority, DownloadStatus } from '@talex-touch/utils'

// 优先级队列节点
interface QueueNode {
  task: DownloadTask
  priority: number
}

// 最小堆实现优先级队列
export class TaskQueue {
  private tasks: Map<string, DownloadTask> = new Map()
  private priorityQueue: QueueNode[] = []

  // 添加任务到队列
  enqueue(task: DownloadTask): void {
    this.tasks.set(task.id, task)

    const node: QueueNode = {
      task,
      priority: task.priority,
    }

    this.priorityQueue.push(node)
    this.heapifyUp(this.priorityQueue.length - 1)
  }

  // 获取下一个待执行任务
  dequeue(): DownloadTask | null {
    if (this.priorityQueue.length === 0) {
      return null
    }

    const root = this.priorityQueue[0]
    const lastNode = this.priorityQueue[this.priorityQueue.length - 1]

    // 移除根节点
    this.priorityQueue[0] = lastNode
    this.priorityQueue.pop()

    if (this.priorityQueue.length > 0) {
      this.heapifyDown(0)
    }

    // 从任务映射中移除
    this.tasks.delete(root.task.id)

    return root.task
  }

  // 更新任务优先级
  updatePriority(taskId: string, priority: DownloadPriority): void {
    const task = this.tasks.get(taskId)
    if (!task) {
      return
    }

    task.priority = priority

    // 找到队列中的节点并更新
    const nodeIndex = this.priorityQueue.findIndex(node => node.task.id === taskId)
    if (nodeIndex !== -1) {
      this.priorityQueue[nodeIndex].priority = priority
      this.heapifyUp(nodeIndex)
      this.heapifyDown(nodeIndex)
    }
  }

  // 移除任务
  remove(taskId: string): DownloadTask | null {
    const task = this.tasks.get(taskId)
    if (!task) {
      return null
    }

    // 从队列中移除
    const nodeIndex = this.priorityQueue.findIndex(node => node.task.id === taskId)
    if (nodeIndex !== -1) {
      const lastNode = this.priorityQueue[this.priorityQueue.length - 1]
      this.priorityQueue[nodeIndex] = lastNode
      this.priorityQueue.pop()

      if (nodeIndex < this.priorityQueue.length) {
        this.heapifyUp(nodeIndex)
        this.heapifyDown(nodeIndex)
      }
    }

    this.tasks.delete(taskId)
    return task
  }

  // 获取任务
  getTask(taskId: string): DownloadTask | null {
    return this.tasks.get(taskId) || null
  }

  // 获取队列状态
  getQueueStatus(): QueueStatus {
    const allTasks = Array.from(this.tasks.values())

    return {
      totalTasks: allTasks.length,
      pendingTasks: allTasks.filter(t => t.status === DownloadStatus.PENDING).length,
      activeTasks: allTasks.filter(t => t.status === DownloadStatus.DOWNLOADING).length,
      completedTasks: allTasks.filter(t => t.status === DownloadStatus.COMPLETED).length,
      failedTasks: allTasks.filter(t => t.status === DownloadStatus.FAILED).length,
    }
  }

  // 获取所有任务
  getAllTasks(): DownloadTask[] {
    return Array.from(this.tasks.values())
  }

  // 获取等待中的任务
  getPendingTasks(): DownloadTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === DownloadStatus.PENDING)
      .sort((a, b) => b.priority - a.priority) // 按优先级降序排列
  }

  // 获取进行中的任务
  getActiveTasks(): DownloadTask[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === DownloadStatus.DOWNLOADING,
    )
  }

  // 检查队列是否为空
  isEmpty(): boolean {
    return this.priorityQueue.length === 0
  }

  // 获取队列长度
  size(): number {
    return this.priorityQueue.length
  }

  // 清空队列
  clear(): void {
    this.tasks.clear()
    this.priorityQueue = []
  }

  // 获取下一个任务的优先级
  getNextTaskPriority(): number | null {
    if (this.priorityQueue.length === 0) {
      return null
    }
    return this.priorityQueue[0].priority
  }

  // 上浮操作（堆化向上）
  private heapifyUp(index: number): void {
    if (index === 0) {
      return
    }

    const parentIndex = Math.floor((index - 1) / 2)

    if (this.priorityQueue[index].priority < this.priorityQueue[parentIndex].priority) {
      this.swap(index, parentIndex)
      this.heapifyUp(parentIndex)
    }
  }

  // 下沉操作（堆化向下）
  private heapifyDown(index: number): void {
    const leftChildIndex = 2 * index + 1
    const rightChildIndex = 2 * index + 2
    let smallestIndex = index

    if (
      leftChildIndex < this.priorityQueue.length
      && this.priorityQueue[leftChildIndex].priority < this.priorityQueue[smallestIndex].priority
    ) {
      smallestIndex = leftChildIndex
    }

    if (
      rightChildIndex < this.priorityQueue.length
      && this.priorityQueue[rightChildIndex].priority < this.priorityQueue[smallestIndex].priority
    ) {
      smallestIndex = rightChildIndex
    }

    if (smallestIndex !== index) {
      this.swap(index, smallestIndex)
      this.heapifyDown(smallestIndex)
    }
  }

  // 交换节点
  private swap(index1: number, index2: number): void {
    const temp = this.priorityQueue[index1]
    this.priorityQueue[index1] = this.priorityQueue[index2]
    this.priorityQueue[index2] = temp
  }

  // 查找任务在队列中的位置
  findTaskIndex(taskId: string): number {
    return this.priorityQueue.findIndex(node => node.task.id === taskId)
  }

  // 获取队列中指定优先级范围的任务
  getTasksByPriorityRange(minPriority: number, maxPriority: number): DownloadTask[] {
    return this.priorityQueue
      .filter(node => node.priority >= minPriority && node.priority <= maxPriority)
      .map(node => node.task)
  }

  // 获取高优先级任务（CRITICAL和HIGH）
  getHighPriorityTasks(): DownloadTask[] {
    return this.getTasksByPriorityRange(DownloadPriority.HIGH, DownloadPriority.CRITICAL)
  }

  // 获取普通优先级任务
  getNormalPriorityTasks(): DownloadTask[] {
    return this.getTasksByPriorityRange(DownloadPriority.NORMAL, DownloadPriority.HIGH - 1)
  }

  // 获取低优先级任务
  getLowPriorityTasks(): DownloadTask[] {
    return this.getTasksByPriorityRange(DownloadPriority.BACKGROUND, DownloadPriority.LOW)
  }
}
