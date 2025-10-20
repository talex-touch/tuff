/**
 * 通知功能示例
 * 展示如何使用通知功能
 */

const sdk = window.$touchSDK

// 通知操作示例
async function notificationExamples() {
  try {
    // 显示简单通知
    await sdk.sendMessage('notification:show', {
      title: 'Hello World',
      body: 'This is a simple notification',
      options: {
        icon: 'info',
        timeout: 3000
      }
    })

    // 显示带操作的通知
    await sdk.sendMessage('notification:show', {
      title: 'Plugin Update',
      body: 'New version is available',
      options: {
        icon: 'update',
        actions: [
          { id: 'update', label: 'Update Now' },
          { id: 'later', label: 'Later' }
        ]
      }
    })

    // 显示进度通知
    await sdk.sendMessage('notification:show', {
      title: 'Downloading',
      body: 'Downloading file...',
      options: {
        icon: 'download',
        progress: 0
      }
    })

    // 更新进度
    for (let i = 0; i <= 100; i += 10) {
      await sdk.sendMessage('notification:update', {
        id: 'download-notification',
        title: 'Downloading',
        body: `Progress: ${i}%`,
        options: {
          progress: i
        }
      })
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    // 隐藏通知
    await sdk.sendMessage('notification:hide', {
      id: 'download-notification'
    })

  } catch (error) {
    console.error('Notification operations failed:', error)
  }
}

// 处理函数
function handleNotificationShow(data) {
  console.log('Showing notification:', data.title, data.body)
  // 实现显示逻辑
}

function handleNotificationHide(data) {
  console.log('Hiding notification:', data.id)
  // 实现隐藏逻辑
}

function handleNotificationUpdate(data) {
  console.log('Updating notification:', data.id, data.title, data.body)
  // 实现更新逻辑
}

