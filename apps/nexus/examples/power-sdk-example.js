import { hasWindow } from '@talex-touch/utils/env'
import { usePowerSDK } from '@talex-touch/utils/plugin/sdk'

/**
 * PowerSDK 示例
 * - 插件渲染上下文：基于电量状态做轻量/重载模式切换
 * - 注意：index.js 全局 power 的变化监听目前是轮询策略（约 60s）
 */

const power = usePowerSDK()

function applyPowerMode(status) {
  if (status.lowPower) {
    console.warn('[PowerSDK] low power on -> use lightweight mode', status)
    // 在这里降级重任务：例如暂停 OCR/批量扫描/高频轮询
    return
  }

  console.warn('[PowerSDK] low power off -> resume normal mode', status)
}

async function checkPowerOnce(options = { threshold: 25 }) {
  const status = await power.getLowPowerStatus(options)
  applyPowerMode(status)
  return status
}

function watchPower(options = { threshold: 25 }) {
  const dispose = power.onLowPowerChanged(
    (status) => {
      applyPowerMode(status)
    },
    {
      threshold: options.threshold,
      emitImmediately: true,
    },
  )

  return dispose
}

window.powerSDKExample = {
  checkPowerOnce,
  watchPower,
}

if (hasWindow() && window.location.hostname === 'localhost') {
  console.warn('[PowerSDK] auto start demo')
  let dispose = () => {}

  void checkPowerOnce({ threshold: 25 })
    .then(() => {
      dispose = watchPower({ threshold: 25 })
    })
    .catch((error) => {
      console.error('[PowerSDK] demo failed', error)
    })

  // 可选：30 秒后停止示例监听
  setTimeout(() => {
    dispose()
  }, 30_000)
}
