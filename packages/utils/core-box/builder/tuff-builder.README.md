# TUFF Builder 工具类

> Typed Unified Flex Format 构建工具

## 简介

TUFF Builder 是一套高效的工具类，用于创建和管理 TuffItem 对象。它结合了 Builder 模式和工厂方法，既保证了 API 的流畅性，又确保了性能。特别适合需要创建大量 TuffItem 对象的场景，如搜索结果、文件列表、应用列表等。

## 设计理念

- **流畅的 API**：支持链式调用，简化创建过程
- **性能优化**：最小化中间对象创建，适合大量对象场景
- **类型安全**：完整的 TypeScript 类型支持
- **便捷工厂**：针对常见场景提供快捷创建方法
- **批量处理**：支持高效的批量创建和处理

## 主要组件

### 1. TuffItemBuilder

基于 Builder 模式实现的 TuffItem 构建器，支持链式调用。

```typescript
const item = new TuffItemBuilder()
  .setSource('plugin', 'my-plugin')
  .setTitle('我的项目')
  .setIcon({ type: 'emoji', value: '🚀' })
  .addAction({
    id: 'open',
    type: 'open',
    label: '打开',
    primary: true
  })
  .build();
```

### 2. TuffFactory

提供一系列静态工厂方法，用于快速创建各种类型的 TuffItem 对象。

```typescript
// 创建文件项目
const fileItem = TuffFactory.createFileItem(
  'config.json',
  '/Users/config.json',
  'plugin',
  'settings-manager'
);

// 创建应用项目
const appItem = TuffFactory.createAppItem(
  'Visual Studio Code',
  '/Applications/Visual Studio Code.app',
  'com.microsoft.VSCode',
  'plugin',
  'app-launcher'
);
```

### 3. TuffBatchBuilder

用于高效地批量创建 TuffItem 对象，适用于需要创建大量相似项目的场景。

```typescript
const batchBuilder = new TuffBatchBuilder('plugin', 'file-explorer')
  .setKind('file')
  .setLayout('list', 'medium')
  .addSharedAction({
    id: 'open',
    type: 'open',
    label: '打开',
    primary: true
  });

// 添加多个项目
batchBuilder
  .addItem('文档1.docx', builder => {
    builder
      .setIcon({ type: 'emoji', value: '📄' })
      .setDescription('Word 文档');
  })
  .addItem('图片.jpg', builder => {
    builder
      .setIcon({ type: 'emoji', value: '🖼️' })
      .setDescription('JPG 图片');
  });

// 批量添加简单项目
batchBuilder.addItems([
  '笔记1.txt',
  '笔记2.txt',
  '笔记3.txt'
]);

// 获取所有创建的项目
const items = batchBuilder.getItems();
```

### 4. TuffUtils

提供一系列实用函数，用于处理和转换 TuffItem 对象。

```typescript
// 创建图标
const icon = TuffUtils.createIcon('🚀');

// 创建标签
const tag = TuffUtils.createTag('重要', '#FF0000', 'filled');

// 创建行为
const action = TuffUtils.createAction('open', 'open', '打开', true);

// 过滤项目
const fileItems = TuffUtils.filterByKind(items, 'file');

// 搜索项目
const searchResults = TuffUtils.searchByTitle(items, '文档');

// 排序项目
const sortedItems = TuffUtils.sortByScore(items);
```

## 使用场景

### 单个项目创建

当需要创建单个 TuffItem 对象时，可以使用 `TuffItemBuilder` 或 `TuffFactory`：

```typescript
// 使用 Builder 模式
const item1 = new TuffItemBuilder()
  .setSource('plugin', 'my-plugin')
  .setTitle('我的项目')
  .setDescription('项目描述')
  .build();

// 使用工厂方法
const item2 = TuffFactory.createFileItem(
  '配置文件.json',
  '/path/to/config.json',
  'plugin',
  'settings-manager'
);
```

### 批量创建

当需要创建大量相似的 TuffItem 对象时，可以使用 `TuffBatchBuilder`：

```typescript
const batchBuilder = new TuffBatchBuilder('plugin', 'file-explorer')
  .setKind('file');

// 从数据对象批量创建
const files = [
  { name: '文档.docx', type: 'docx', size: 1024 * 1024 },
  { name: '图片.jpg', type: 'jpg', size: 1024 * 512 },
  { name: '表格.xlsx', type: 'xlsx', size: 1024 * 2048 }
];

batchBuilder.addItemsFromData(files, 'name', (file) => {
  return (builder) => {
    builder
      .setDescription(`${file.type.toUpperCase()} 文件`)
      .setMeta({
        file: {
          type: file.type,
          size: file.size
        }
      });
  };
});

const items = batchBuilder.getItems();
```

### 处理项目列表

当需要处理 TuffItem 对象列表时，可以使用 `TuffUtils`：

```typescript
// 过滤文件类型的项目
const fileItems = TuffUtils.filterByKind(items, 'file');

// 按标题搜索项目
const searchResults = TuffUtils.searchByTitle(items, '文档');

// 按评分排序项目
const sortedByScore = TuffUtils.sortByScore(items);

// 按标题排序项目
const sortedByTitle = TuffUtils.sortByTitle(items);
```

## 性能考虑

TUFF Builder 工具类在设计时特别考虑了性能因素，适合创建大量 TuffItem 对象的场景：

1. **最小化对象创建**：避免创建不必要的中间对象
2. **共享配置**：`TuffBatchBuilder` 允许多个项目共享相同的配置
3. **延迟构建**：只在调用 `build()` 方法时才创建最终对象
4. **高效过滤和排序**：`TuffUtils` 提供的方法经过优化，适合处理大量对象

## 扩展性

TUFF Builder 工具类设计为可扩展的，可以根据需要添加新的工厂方法或实用函数：

```typescript
// 扩展 TuffFactory
class MyTuffFactory extends TuffFactory {
  static createCustomItem(title: string, data: any): TuffItem {
    return new TuffItemBuilder()
      .setSource('custom', 'my-source')
      .setTitle(title)
      .setMeta({ custom: data })
      .build();
  }
}

// 扩展 TuffUtils
class MyTuffUtils extends TuffUtils {
  static customFilter(items: TuffItem[], criteria: any): TuffItem[] {
    // 自定义过滤逻辑
    return items.filter(/* ... */);
  }
}
```

## 最佳实践

1. **使用工厂方法**：对于常见类型的项目，优先使用 `TuffFactory` 提供的工厂方法
2. **批量处理**：处理大量项目时，使用 `TuffBatchBuilder` 而不是循环创建
3. **共享配置**：尽可能共享配置，减少重复设置
4. **类型安全**：充分利用 TypeScript 的类型系统，确保类型安全
5. **性能优化**：处理大量项目时，考虑使用 `TuffUtils` 提供的过滤和排序方法

## 示例代码

完整的示例代码可以参考 `tuff-builder.example.ts` 文件。

## 单元测试

完整的单元测试可以参考 `tuff-builder.test.ts` 文件。