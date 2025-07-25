import PinyinMatch from "pinyin-match";
import { BoxMode, SearchItem, SearchOptions } from './search-box'
import type { IFeatureCommand } from '@talex-touch/utils/plugin';

function check(keyword: string, appName: string) {
  return PinyinMatch.match(appName, keyword);
}

type ISearchMiddleware = (item: SearchItem, keyword: string, options: SearchOptions) => SearchItem | SearchItem[] | null

const middlewares = new Array<ISearchMiddleware>()

middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  const res = check(keyword, item.name)

  if (res !== false) {
    return {
      ...item,
      matched: res
    }
  }

  return null
})

middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  const res = check(keyword, item.desc)

  if (res !== false) {
    return {
      ...item,
      descMatched: true,
      matched: res
    }
  }

  return null
})

// 添加 ID 搜索中间件
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  // 检查 item 是否有 id 字段
  if (item.id) {
    const res = check(keyword, item.id)

    if (res !== false) {
      return {
        ...item,
        idMatched: true,
        matched: res
      }
    }
  }

  return null
})

middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  // Abridge
  const keywords = item.keyWords
  if (!keyword.length) return null

  const res = check(keyword, keywords.at(-1)!)

  if (res !== false) {
    return {
      ...item,
      matched: res
    }
  }

  return null
})

function validateCommand(item: SearchItem, keyword: string, options: SearchOptions, cmd: IFeatureCommand) {
  const { type, value } = cmd

  // case
  if (options.mode === BoxMode.FILE) {
    if (type === 'files') {
      // todo
      return item
    }
  } else if (options.mode === BoxMode.IMAGE) {
    if (type === 'image') {
      // todo
      return item
    }
  } else if (options.mode === BoxMode.INPUT) {
    if (type === 'match' && value === keyword) {
      return item
    } else if (type === 'regex') {
      const _r = new RegExp(value as string)

      if (_r.test(keyword)) return item
    } else if (type === 'contain') {
      if ((keyword.length && (value === "" || keyword.indexOf(value as string) !== -1)))
        return item

    }
  }

  return null
}

middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  // if it is feature -> validate feature commands
  const { pluginType } = item
  if (pluginType !== 'feature') return null

  const commands = item.commands!
  const results: any[] = []

  for (let cmd of commands) {
    const cmdObj: SearchItem = {
      id: item.id,
      name: item.name,
      desc: item.desc,
      icon: item.icon,
      push: true,
      names: [...item.names],
      keyWords: [...item.keyWords],
      pluginType: "cmd",
      type: item.type,
      value: item.value,
      originFeature: item
    }

    results.push(validateCommand(cmdObj, keyword, options, cmd))
  }

  return results.filter(Boolean)
})

export function handleItemData(item: SearchItem, keyword: string, options: SearchOptions) {

  for (let middleware of middlewares) {
    const res = middleware(item, keyword, options)

    if (res) {
      return res
    }
  }

  return null;
}