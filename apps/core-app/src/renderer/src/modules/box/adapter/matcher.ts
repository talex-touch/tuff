import PinyinMatch from 'pinyin-match'
import { BoxMode, SearchItem, SearchOptions, ISearchMiddleware } from './types'
import type { IFeatureCommand } from '@talex-touch/utils/plugin'

/**
 * Checks if a keyword matches an app name using pinyin matching
 * @param keyword - The search keyword
 * @param appName - The app name to match against
 * @returns Match result or false if no match
 */
function check(keyword: string, appName: string) {
  return PinyinMatch.match(appName, keyword)
}

const middlewares = new Array<ISearchMiddleware>()

/**
 * Name matching middleware - matches items by name
 */
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  // For empty queries, don't match by name (let features handle it)
  if (!keyword.length) return null

  const res = check(keyword, item.name)

  if (res !== false) {
    return {
      ...item,
      matched: res,
      matchedByName: true
    }
  }

  return null
})

/**
 * Description matching middleware - matches items by description
 */
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  // For empty queries, don't match by description (let features handle it)
  if (!keyword.length) return null

  const res = check(keyword, item.desc)

  if (res !== false) {
    return {
      ...item,
      descMatched: true,
      matched: res,
      matchedByName: true
    }
  }

  return null
})

/**
 * ID matching middleware - matches items by ID
 */
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  // For empty queries, don't match by ID (let features handle it)
  if (!keyword.length) return null

  if (item.id) {
    const res = check(keyword, item.id)

    if (res !== false) {
      return {
        ...item,
        idMatched: true,
        matched: res,
        matchedByName: true
      }
    }
  }

  return null
})

/**
 * Names matching middleware - matches items by alternative names
 */
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  const names = item.names
  if (!keyword.length || !names || names.length === 0) return null

  // Check all alternative names
  for (const nameItem of names) {
    const res = check(keyword, nameItem)

    if (res !== false) {
      return {
        ...item,
        matched: res,
        matchedByName: true
      }
    }
  }

  return null
})

/**
 * Keywords matching middleware - matches items by keywords
 */
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  if (options.mode !== BoxMode.INPUT) return null

  const keywords = item.keyWords
  if (!keyword.length || !keywords || keywords.length === 0) return null

  // Check all keywords, not just the last one
  for (const keywordItem of keywords) {
    const res = check(keyword, keywordItem)

    if (res !== false) {
      return {
        ...item,
        matched: res,
        matchedByName: true
      }
    }
  }

  return null
})

/**
 * Validates if a command matches the given keyword and options
 * @param item - The search item
 * @param keyword - The search keyword
 * @param options - Search options
 * @param cmd - The feature command to validate
 * @returns The item if command matches, null otherwise
 */
function validateCommand(
  item: SearchItem,
  keyword: string,
  options: SearchOptions,
  cmd: IFeatureCommand
) {
  const { type, value } = cmd

  if (options.mode === BoxMode.FILE) {
    if (type === 'files') {
      return item
    }
  } else if (options.mode === BoxMode.IMAGE) {
    if (type === 'image') {
      return item
    }
  } else if (options.mode === BoxMode.INPUT) {
    if (type === 'match') {
      // For empty queries, don't match exact commands
      if (!keyword.length) return null
      if (value === keyword) return item
    } else if (type === 'regex') {
      // For empty queries, don't match regex commands
      if (!keyword.length) return null
      const _r = new RegExp(value as string)
      if (_r.test(keyword)) return item
    } else if (type === 'contain') {
      // For empty queries, show all features with contain commands
      // For non-empty queries, check if keyword contains the value or value is empty
      if (!keyword.length || value === '' || keyword.indexOf(value as string) !== -1) return item
    }
  }

  return null
}

/**
 * Feature command matching middleware - validates feature commands and ensures features are always shown
 */
middlewares.push((item: SearchItem, keyword: string, options: SearchOptions) => {
  const { pluginType } = item
  if (pluginType !== 'feature') return null

  const commands = item.commands
  if (!commands || commands.length === 0) {
    // If no commands, return the feature item as-is
    return item
  }

  const results: any[] = []
  let hasMatchingCommand = false

  for (const cmd of commands) {
    const cmdObj: SearchItem = {
      id: item.id,
      name: item.name,
      desc: item.desc,
      icon: item.icon,
      push: true,
      names: [...item.names],
      keyWords: [...item.keyWords],
      pluginType: 'cmd',
      type: item.type,
      value: item.value,
      originFeature: item
    }

    const matchResult = validateCommand(cmdObj, keyword, options, cmd)
    if (matchResult) {
      results.push(matchResult)
      hasMatchingCommand = true
    }
  }

  if (hasMatchingCommand) {
    return results
  }

  return item
})

/**
 * Processes search item through all middleware and returns the first match
 * @param item - The search item to process
 * @param keyword - The search keyword
 * @param options - Search options
 * @returns Processed item or null if no match
 */
export function handleItemData(item: SearchItem, keyword: string, options: SearchOptions) {
  for (const middleware of middlewares) {
    const res = middleware(item, keyword, options)

    if (res) {
      return res
    }
  }

  return null
}