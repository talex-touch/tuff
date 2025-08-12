/**
 * TUFF Builder 单元测试
 * 测试 TuffBuilder 工具类的功能
 */

import { TuffItemBuilder, TuffFactory, TuffBatchBuilder, TuffUtils } from '@talex-touch/utils/core-box/builder/tuff-builder';
import type { TuffItem, TuffAction, TuffContext, TuffMeta } from '@talex-touch/utils/core-box/tuff/tuff-dsl';

// 导入 Vitest 测试函数
import { describe, test, expect } from 'vitest';

describe('TuffItemBuilder', () => {
  test('应该创建基本的 TuffItem', () => {
    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .build();

    expect(item).toBeDefined();
    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
    expect(item.render.basic?.title).toBe('测试项目');
  });

  test('应该通过构造函数设置 ID 和来源', () => {
    const item = new TuffItemBuilder('test-id', 'plugin', 'test-plugin')
      .setTitle('测试项目')
      .build();

    expect(item.id).toBe('test-id');
    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
  });

  test('应该设置所有基本渲染属性', () => {
    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试标题')
      .setSubtitle('测试副标题')
      .setDescription('测试描述')
      .setIcon({ type: 'emoji', value: '🚀' })
      .setAccessory('附加信息')
      .build();

    expect(item.render.basic?.title).toBe('测试标题');
    expect(item.render.basic?.subtitle).toBe('测试副标题');
    expect(item.render.basic?.description).toBe('测试描述');
    expect(item.render.basic?.icon).toEqual({ type: 'emoji', value: '🚀' });
    expect(item.render.basic?.accessory).toBe('附加信息');
  });

  test('应该添加标签', () => {
    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .addTag({ text: '标签1' })
      .addTag({ text: '标签2', color: '#FF0000' })
      .build();

    expect(item.render.basic?.tags).toHaveLength(2);
    expect(item.render.basic?.tags?.[0].text).toBe('标签1');
    expect(item.render.basic?.tags?.[1].text).toBe('标签2');
    expect(item.render.basic?.tags?.[1].color).toBe('#FF0000');
  });

  test('应该设置标签列表', () => {
    const tags = [
      { text: '标签A' },
      { text: '标签B', color: '#00FF00' }
    ];

    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .setTags(tags)
      .build();

    expect(item.render.basic?.tags).toEqual(tags);
  });

  test('应该设置自定义渲染', () => {
    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setCustomRender(
        'html',
        '<div>自定义内容</div>',
        { key: 'value' },
        ['style.css'],
        ['script.js']
      )
      .build();

    expect(item.render.mode).toBe('custom');
    expect(item.render.custom?.type).toBe('html');
    expect(item.render.custom?.content).toBe('<div>自定义内容</div>');
    expect(item.render.custom?.data).toEqual({ key: 'value' });
    expect(item.render.custom?.styles).toEqual(['style.css']);
    expect(item.render.custom?.scripts).toEqual(['script.js']);
  });

  test('应该添加行为', () => {
    const action: TuffAction = {
      type: 'open',
      target: 'https://example.com',
      title: '打开链接'
    };

    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .addAction(action)
      .build();

    expect(item.actions).toHaveLength(1);
    expect(item.actions[0]).toEqual(action);
  });

  test('应该设置行为列表', () => {
    const actions: TuffAction[] = [
      {
        type: 'open',
        target: 'https://example.com',
        title: '打开链接'
      },
      {
        type: 'copy',
        target: 'text to copy',
        title: '复制文本'
      }
    ];

    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .setActions(actions)
      .build();

    expect(item.actions).toEqual(actions);
  });

  test('应该设置上下文和元数据', () => {
    const context = { query: 'test query' } as TuffContext;
    const meta = { key: 'value' } as TuffMeta;

    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .setContext(context)
      .setMeta(meta)
      .build();

    expect(item.context).toEqual(context);
    expect(item.meta).toEqual(meta);
  });

  test('应该设置评分和权重', () => {
    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .setScore(0.85)
      .setWeight(2)
      .build();

    expect(item.scoring?.score).toBe(0.85);
    expect(item.scoring?.weight).toBe(2);
  });

  test('应该设置项目类型和权限', () => {
    const item = new TuffItemBuilder()
      .setSource('plugin', 'test-plugin')
      .setTitle('测试项目')
      .setKind('file')
      .setPermission('user')
      .build();

    expect(item.kind).toBe('file');
    expect(item.permission).toBe('user');
  });

  test('应该抛出错误当缺少必要属性', () => {
    const builder = new TuffItemBuilder();
    expect(() => builder.build()).toThrow();

    builder.setTitle('测试项目');
    expect(() => builder.build()).toThrow();
  });
});

describe('TuffFactory', () => {
  test('应该创建文件项目', () => {
    const item = TuffFactory.createFileItem(
      'plugin',
      'test-plugin',
      '文件名.txt',
      '/path/to/file.txt',
      'text/plain'
    );

    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
    expect(item.render.basic?.title).toBe('文件名.txt');
    expect(item.kind).toBe('file');
    expect(item.meta?.path).toBe('/path/to/file.txt');
    expect(item.meta?.mime).toBe('text/plain');
  });

  test('应该创建应用项目', () => {
    const item = TuffFactory.createAppItem(
      'plugin',
      'test-plugin',
      '应用名称',
      'app-id',
      { type: 'emoji', value: '📱' }
    );

    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
    expect(item.render.basic?.title).toBe('应用名称');
    expect(item.kind).toBe('app');
    expect(item.meta?.appId).toBe('app-id');
    expect(item.render.basic?.icon).toEqual({ type: 'emoji', value: '📱' });
  });

  test('应该创建命令项目', () => {
    const item = TuffFactory.createCommandItem(
      'plugin',
      'test-plugin',
      '命令名称',
      'echo "Hello World"'
    );

    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
    expect(item.render.basic?.title).toBe('命令名称');
    expect(item.kind).toBe('command');
    expect(item.meta?.command).toBe('echo "Hello World"');
    expect(item.actions[0].type).toBe('execute');
  });

  test('应该创建链接项目', () => {
    const item = TuffFactory.createLinkItem(
      'plugin',
      'test-plugin',
      '链接标题',
      'https://example.com',
      '链接描述'
    );

    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
    expect(item.render.basic?.title).toBe('链接标题');
    expect(item.render.basic?.description).toBe('链接描述');
    expect(item.kind).toBe('link');
    expect(item.actions[0].type).toBe('open');
    expect(item.actions[0].target).toBe('https://example.com');
  });

  test('应该创建文本项目', () => {
    const item = TuffFactory.createTextItem(
      'plugin',
      'test-plugin',
      '文本标题',
      '这是一段文本内容'
    );

    expect(item.source.type).toBe('plugin');
    expect(item.source.id).toBe('test-plugin');
    expect(item.render.basic?.title).toBe('文本标题');
    expect(item.render.basic?.description).toBe('这是一段文本内容');
    expect(item.kind).toBe('text');
    expect(item.actions[0].type).toBe('copy');
    expect(item.actions[0].target).toBe('这是一段文本内容');
  });
});

describe('TuffBatchBuilder', () => {
  test('应该批量创建项目', () => {
    const batch = new TuffBatchBuilder('plugin', 'test-plugin');
    
    batch.addItem()
      .setTitle('项目1')
      .setDescription('描述1');
    
    batch.addItem()
      .setTitle('项目2')
      .setDescription('描述2');
    
    const items = batch.build();
    
    expect(items).toHaveLength(2);
    expect(items[0].render.basic?.title).toBe('项目1');
    expect(items[1].render.basic?.title).toBe('项目2');
    expect(items[0].source.type).toBe('plugin');
    expect(items[0].source.id).toBe('test-plugin');
  });

  test('应该支持链式添加项目', () => {
    const batch = new TuffBatchBuilder('plugin', 'test-plugin');
    
    batch.addItem('项目1', builder => builder.setDescription('描述1'));
    batch.addItem('项目2', builder => builder.setDescription('描述2'));
    
    const items = batch.build();
    
    expect(items).toHaveLength(2);
    expect(items[0].render.basic?.title).toBe('项目1');
    expect(items[1].render.basic?.title).toBe('项目2');
  });

  test('应该支持从对象数组创建', () => {
    const rawItems = [
      { title: '项目A', description: '描述A' },
      { title: '项目B', description: '描述B' }
    ];
    
    const items = TuffBatchBuilder.fromArray(
      'plugin',
      'test-plugin',
      rawItems,
      (item, raw) => {
        item.setTitle(raw.title)
          .setDescription(raw.description);
      }
    );
    
    expect(items).toHaveLength(2);
    expect(items[0].render.basic?.title).toBe('项目A');
    expect(items[1].render.basic?.title).toBe('项目B');
  });
});

describe('TuffUtils', () => {
  test('应该生成唯一ID', () => {
    const id1 = TuffUtils.generateId();
    const id2 = TuffUtils.generateId();
    
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  test('应该创建图标', () => {
    const emojiIcon = TuffUtils.createIcon('🔍');
    const urlIcon = TuffUtils.createIcon('https://example.com/icon.png', 'url');
    
    expect(emojiIcon).toEqual({ type: 'emoji', value: '🔍' });
    expect(urlIcon).toEqual({ type: 'url', value: 'https://example.com/icon.png' });
  });

  test('应该创建标签', () => {
    const tag = TuffUtils.createTag('标签文本', '#FF0000');
    
    expect(tag.text).toBe('标签文本');
    expect(tag.color).toBe('#FF0000');
  });

  test('应该创建行为', () => {
    const action = TuffUtils.createAction('open', 'https://example.com', '打开链接');
    
    expect(action.type).toBe('open');
    expect(action.target).toBe('https://example.com');
    expect(action.title).toBe('打开链接');
  });

  test('应该过滤项目列表', () => {
    const items: TuffItem[] = [
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('文件项目')
        .setKind('file')
        .build(),
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('应用项目')
        .setKind('app')
        .build(),
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('命令项目')
        .setKind('command')
        .build()
    ];
    
    const fileItems = TuffUtils.filterByKind(items, 'file');
    const appItems = TuffUtils.filterByKind(items, 'app');
    
    expect(fileItems).toHaveLength(1);
    expect(appItems).toHaveLength(1);
    expect(fileItems[0].kind).toBe('file');
    expect(appItems[0].kind).toBe('app');
  });

  test('应该搜索项目列表', () => {
    const items: TuffItem[] = [
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('搜索测试')
        .setDescription('这是一个测试项目')
        .build(),
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('另一个项目')
        .setDescription('不匹配的描述')
        .build()
    ];
    
    const results = TuffUtils.searchItems(items, '测试');
    
    expect(results).toHaveLength(1);
    expect(results[0].render.basic?.title).toBe('搜索测试');
  });

  test('应该排序项目列表', () => {
    const items: TuffItem[] = [
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('C项目')
        .setScore(0.5)
        .build(),
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('A项目')
        .setScore(0.9)
        .build(),
      new TuffItemBuilder()
        .setSource('plugin', 'test-plugin')
        .setTitle('B项目')
        .setScore(0.7)
        .build()
    ];
    
    const sorted = TuffUtils.sortByScore(items);
    
    expect(sorted[0].render.basic?.title).toBe('A项目');
    expect(sorted[1].render.basic?.title).toBe('B项目');
    expect(sorted[2].render.basic?.title).toBe('C项目');
  });
});