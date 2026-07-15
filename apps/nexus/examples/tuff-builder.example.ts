/* eslint-disable no-console -- executable example intentionally prints each step */

/**
 * TUFF Builder 示例文件
 * 展示如何使用 TuffBuilder 工具类创建和管理 TuffItem 对象
 */

import type { TuffItem } from '../tuff/tuff-dsl'
import { TuffFactory, TuffItemBuilder, TuffListBuilder, TuffUtils } from './tuff-builder'

// ==================== 基本用法示例 ====================

/**
 * 示例 1: 使用 TuffItemBuilder 创建单个项目
 */
function createSingleItem(): TuffItem {
  // 使用 Builder 模式创建一个完整的 TuffItem
  const item = new TuffItemBuilder('doc-1')
    .setSource('plugin', 'file-explorer')
    .setTitle('文档.docx')
    .setDescription('Word 文档')
    .setIcon(TuffUtils.createIcon('📄'))
    .setKind('file')
    .addTag(TuffUtils.createTag('文档', '#4285F4'))
    .addTag(TuffUtils.createTag('最近', '#34A853'))
    .setAccessory('2023-06-15')
    .addAction(TuffUtils.createAction('open', 'open', '打开', true))
    .addAction(TuffUtils.createAction('copy', 'copy', '复制路径', false))
    .setMeta({
      file: {
        path: '/Users/documents/文档.docx',
        size: 1024 * 1024 * 2, // 2MB
        modified_at: '2023-06-15T10:30:00Z',
      },
    })
    .build()

  return item
}

/**
 * 示例 2: 使用 TuffFactory 快速创建常见类型的项目
 */
function createCommonItems(): TuffItem[] {
  const items: TuffItem[] = []

  // 创建基本项目
  const basicItem = TuffFactory.createBasicItem(
    '基本项目',
    'system',
    'basic-example',
    'text',
  )
  items.push(basicItem)

  // 创建文件项目
  const fileItem = TuffFactory.createFileItem(
    'config.json',
    '/Users/config.json',
    'plugin',
    'settings-manager',
  )
  items.push(fileItem)

  // 创建文件夹项目
  const folderItem = TuffFactory.createFolderItem(
    '项目文件夹',
    '/Users/projects',
    'plugin',
    'file-explorer',
  )
  items.push(folderItem)

  // 创建链接项目
  const urlItem = TuffFactory.createUrlItem(
    'Tuff 文档',
    'https://example.com/tuff-docs',
    'plugin',
    'web-search',
  )
  items.push(urlItem)

  // 创建应用项目
  const appItem = TuffFactory.createAppItem(
    'Visual Studio Code',
    '/Applications/Visual Studio Code.app',
    'com.microsoft.VSCode',
    'plugin',
    'app-launcher',
  )
  items.push(appItem)

  // 创建命令项目
  const commandItem = TuffFactory.createCommandItem(
    '查看系统信息',
    'system_profiler SPHardwareDataType',
    'plugin',
    'terminal',
  )
  items.push(commandItem)

  return items
}

/**
 * 示例 3: 使用 TuffBatchBuilder 批量创建项目
 */
function createBatchItems(): TuffItem[] {
  // 创建批量构建器，设置共享的来源信息
  const batchBuilder = new TuffListBuilder('plugin', 'file-explorer')
    .setSharedKind('file')

    .addSharedAction(TuffUtils.createAction('open', 'open', '打开', true))

  // 添加多个项目
  batchBuilder
    .addItem((builder) => {
      builder
        .setTitle('文档1.docx')
        .setIcon(TuffUtils.createIcon('📄'))
        .setDescription('Word 文档')
        .addTag(TuffUtils.createTag('文档', '#4285F4'))
    })
    .addItem((builder) => {
      builder
        .setTitle('图片.jpg')
        .setIcon(TuffUtils.createIcon('🖼️'))
        .setDescription('JPG 图片')
        .addTag(TuffUtils.createTag('图片', '#FBBC05'))
    })
    .addItem((builder) => {
      builder
        .setTitle('表格.xlsx')
        .setIcon(TuffUtils.createIcon('📊'))
        .setDescription('Excel 表格')
        .addTag(TuffUtils.createTag('表格', '#34A853'))
    })

  // 批量添加简单项目
  batchBuilder.addItemsFromData([
    { name: '笔记1.txt' },
    { name: '笔记2.txt' },
    { name: '笔记3.txt' },
  ], (builder, item) => builder.setTitle(item.name))

  // 从数据对象批量创建项目
  const fileData = [
    { name: '报告.pdf', type: 'pdf', size: 1024 * 1024 * 3, modified: '2023-06-10' },
    { name: '演示.pptx', type: 'pptx', size: 1024 * 1024 * 5, modified: '2023-06-12' },
    { name: '数据.csv', type: 'csv', size: 1024 * 512, modified: '2023-06-14' },
  ]

  batchBuilder.addItemsFromData(fileData, (builder, file) => {
    let icon = '📄'
    if (file.type === 'pdf')
      icon = '📕'
    if (file.type === 'pptx')
      icon = '📊'
    if (file.type === 'csv')
      icon = '📈'

    builder
      .setTitle(file.name)
      .setIcon(TuffUtils.createIcon(icon))
      .setDescription(`${file.type.toUpperCase()} 文件`)
      .setAccessory(file.modified)
      .setMeta({
        file: {
          path: file.name,
          size: file.size,
          modified_at: file.modified,
        },
      })
  })

  return batchBuilder.build()
}

/**
 * 示例 4: 使用 TuffUtils 处理项目列表
 */
function processItems(items: TuffItem[]): void {
  // 过滤文件类型的项目
  const fileItems = TuffUtils.filterByKind(items, 'file')
  console.log(`文件项目数量: ${fileItems.length}`)

  // 按标题搜索项目
  const searchResults = TuffUtils.searchByTitle(items, '文档')
  console.log(`包含"文档"的项目数量: ${searchResults.length}`)

  // 按评分排序项目
  const sortedByScore = TuffUtils.sortByScore(items)
  console.log('按评分排序的前 3 个项目:')
  sortedByScore.slice(0, 3).forEach((item) => {
    console.log(` - ${item.render.basic?.title} (评分: ${item.scoring?.final ?? 0})`)
  })

  // 按标题排序项目
  const sortedByTitle = TuffUtils.sortByTitle(items)
  console.log('按标题排序的前 3 个项目:')
  sortedByTitle.slice(0, 3).forEach((item) => {
    console.log(` - ${item.render.basic?.title}`)
  })
}

/**
 * 示例 5: 从普通对象创建 TuffItem
 */
function createFromObjects(): TuffItem[] {
  // 示例数据
  const data = [
    { name: '项目 A', description: '这是项目 A 的描述', type: 'project' },
    { name: '任务 B', description: '这是任务 B 的描述', type: 'task', priority: 'high' },
    { name: '笔记 C', description: '这是笔记 C 的内容', type: 'note', tags: ['重要', '工作'] },
  ]

  // 从对象数组创建 TuffItem 数组
  return TuffUtils.fromObjects(data, 'plugin', 'data-converter')
}

/**
 * 运行所有示例
 */
function runAllExamples(): void {
  console.log('===== 示例 1: 使用 TuffItemBuilder 创建单个项目 =====')
  const singleItem = createSingleItem()
  console.log(JSON.stringify(singleItem, null, 2))

  console.log('\n===== 示例 2: 使用 TuffFactory 快速创建常见类型的项目 =====')
  const commonItems = createCommonItems()
  console.log(`创建了 ${commonItems.length} 个项目`)

  console.log('\n===== 示例 3: 使用 TuffBatchBuilder 批量创建项目 =====')
  const batchItems = createBatchItems()
  console.log(`批量创建了 ${batchItems.length} 个项目`)

  console.log('\n===== 示例 4: 使用 TuffUtils 处理项目列表 =====')
  // 合并所有创建的项目
  const allItems = [singleItem, ...commonItems, ...batchItems]
  processItems(allItems)

  console.log('\n===== 示例 5: 从普通对象创建 TuffItem =====')
  const objectItems = createFromObjects()
  console.log(`从对象创建了 ${objectItems.length} 个项目`)
  objectItems.forEach((item) => {
    console.log(` - ${item.render.basic?.title}`)
  })
}

// 如果直接运行此文件，则执行所有示例
if (require.main === module) {
  runAllExamples()
}

// 导出示例函数，以便其他模块可以使用
export {
  createBatchItems,
  createCommonItems,
  createFromObjects,
  createSingleItem,
  processItems,
  runAllExamples,
}
