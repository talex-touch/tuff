import { TuffItem, TuffQuery } from '../../search-engine/types'
import { TuffFactory, TuffItemBuilder } from '@talex-touch/utils/core-box'
import { files as filesSchema, keywordMappings } from '../../../../db/schema'
import path from 'path'
import { pinyin } from 'pinyin-pro'
import { calculateHighlights, Range } from './highlighting-service' // 复用现有的高亮服务
import { levenshteinDistance } from '@talex-touch/utils/search/levenshtein-utils'

// Helper function from app-provider.ts
function generateAcronym(name: string): string {
  if (!name || !name.includes(' ')) {
    return ''
  }
  return name
    .split(' ')
    .filter((word) => word)
    .map((word) => word.charAt(0))
    .join('')
    .toLowerCase()
}

interface ProcessedTuffItem extends TuffItem {
  score: number; // 用于排序的内部评分
}

export async function processSearchResults(
  apps: (typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> })[],
  query: TuffQuery,
  isFuzzySearch: boolean,
  aliases: Record<string, string[]> // 需要传入别名数据
): Promise<ProcessedTuffItem[]> {
  const lowerCaseQuery = query.text.toLowerCase();
  const processedItems: ProcessedTuffItem[] = [];

  for (const app of apps) {
    const uniqueId = app.extensions.bundleId || app.path;
    const name = app.name;
    const displayName = app.displayName || app.name;
    const potentialTitles = [displayName, name].filter(Boolean) as string[];

    let bestSource: TuffItem['source']['type'] | 'unknown' = 'unknown';
    let bestHighlights: Range[] = [];
    let score = 0;

    // --- 1. 来源推断与区间计算 ---
    if (isFuzzySearch) {
      // 模糊搜索：使用滑窗算法找到最佳匹配子串
      let minFuzzyDist = Infinity;
      let bestFuzzyStart = -1;
      let bestFuzzyEnd = -1;

      for (let i = 0; i <= displayName.length - lowerCaseQuery.length; i++) {
        const sub = displayName.substring(i, i + lowerCaseQuery.length).toLowerCase();
        const dist = levenshteinDistance(sub, lowerCaseQuery);
        if (dist < minFuzzyDist) {
          minFuzzyDist = dist;
          bestFuzzyStart = i;
          bestFuzzyEnd = i + lowerCaseQuery.length;
        }
      }

      if (minFuzzyDist <= 2 && bestFuzzyStart !== -1) { // 假设编辑距离阈值为2
        bestSource = 'name'; // 模糊匹配主要基于名称
        bestHighlights = [[bestFuzzyStart, bestFuzzyEnd]];
        score = 0.1 + (2 - minFuzzyDist) * 0.05; // 模糊匹配分数较低，距离越小分数越高
      }
    } else {
      // 精确搜索：反向推断来源和计算区间
      for (const title of potentialTitles) {
        const titleLowerCase = title.toLowerCase();

        // 尝试匹配首字母缩写
        const acronym = generateAcronym(title);
        if (acronym && lowerCaseQuery.includes(acronym.toLowerCase())) {
          bestSource = 'initials';
          // 需要更复杂的逻辑来获取 initials_pos，目前只能计算大致位置
          const initialsPositions: Range[] = [];
          const words = title.split(' ');
          let currentPos = 0;
          for(const word of words) {
            if (word.length > 0) {
              initialsPositions.push([currentPos, currentPos + 1]);
              currentPos += word.length + 1; // +1 for space
            }
          }
          bestHighlights = initialsPositions; // 这是一个近似值，需要更精确的 `initials_pos`
          score = Math.max(score, 0.8); // 首字母匹配分数较高
          break;
        }
        
        // 尝试匹配别名/标签
        const aliasList = aliases[uniqueId] || aliases[app.path] || [];
        if (aliasList.some(alias => alias.toLowerCase().includes(lowerCaseQuery))) {
          bestSource = 'tag'; // 或者 'alias'
          bestHighlights = calculateHighlights(title, lowerCaseQuery) || [];
          score = Math.max(score, 0.7); // 别名匹配分数
          break;
        }

        // 尝试匹配名称子串
        const highlights = calculateHighlights(title, lowerCaseQuery);
        if (highlights && highlights.length > 0) {
          bestSource = 'name';
          bestHighlights = highlights;
          score = Math.max(score, 0.9); // 名称子串匹配分数最高
          break;
        }

        // 尝试匹配拼音
        const pinyinFull = pinyin(title, { toneType: 'none' }).replace(/\s/g, '');
        if (pinyinFull.includes(lowerCaseQuery)) {
          bestSource = 'name'; // 拼音匹配也算名称来源
          bestHighlights = calculateHighlights(title, lowerCaseQuery) || []; // 拼音高亮需要特殊处理，这里简化
          score = Math.max(score, 0.6); // 拼音匹配分数
          break;
        }
      }
    }

    // 如果没有任何匹配，跳过此项
    if (score === 0 && bestHighlights.length === 0) {
        continue;
    }

    // --- 2. 结果组装 ---
    const tuffItem = new TuffItemBuilder(uniqueId, 'application', 'app-provider')
      .setKind('app')
      .setTitle(displayName)
      .setSubtitle(app.path)
      .setIcon({
        type: 'base64',
        value: app.extensions.icon || '',
      })
      .setActions([
        {
          id: 'open-app',
          type: 'open',
          label: 'Open',
          primary: true,
          payload: {
            path: app.path,
          },
        },
      ])
      .setMeta({
        app: {
          path: app.path,
          bundle_id: app.extensions.bundleId || '',
        },
        extension: {
          matchResult: bestHighlights,
          source: bestSource, // 添加来源信息
          keyWords: [...new Set([name, path.basename(app.path).split('.')[0] || ''])].filter(
            Boolean
          ),
        },
      })
      .setScoring({
        final: score,
      })
      .build();

    processedItems.push({ ...tuffItem, score });
  }

  return processedItems;
}