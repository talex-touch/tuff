import hotkeys from 'hotkeys-js'
import { $event } from '../events'

export function useHotKeysHook() {
  // Ctrl + O 新建对话
  hotkeys('ctrl+o,command+o', 'chat', (e) => {
    e.preventDefault()

    $event.emit('REQUEST_CREATE_NEW_CONVERSATION')
  })

  // Ctrl + S 保存对话
  hotkeys('ctrl+s,command+s', 'chat', (e) => {
    e.preventDefault()

    $event.emit('REQUEST_SAVE_CURRENT_CONVERSATION')
  })

  // 切换边栏
  hotkeys('ctrl+b,command+b', 'chat', () => {
    $event.emit('REQUEST_TOGGLE_SIDEBAR')
  })

  // 显示快捷方式
  hotkeys('ctrl+h,command+h', 'chat', () => {
    $event.emit('REQUEST_SHOW_HOTKEYS')
  })

  // 切换模型
  hotkeys('ctrl+m,command+m', 'chat', () => {
    $event.emit('REQUEST_TOGGLE_MODEL')
  })

  return () => {
    hotkeys.deleteScope('chat')
  }
}
