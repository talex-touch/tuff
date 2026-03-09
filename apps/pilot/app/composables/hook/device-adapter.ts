async function handleBubbledInput() {
  // document.body.addEventListener('blur', (e) => {
  //   console.log(e)
  // })

  // console.log('a')
}

async function handleWechat() {
  const isWeixin = navigator.userAgent.includes('micromessenger')

  if (isWeixin)
    alert('微信浏览器不支持此功能')
}

export function useDeviceAdapter() {
  // 监听所有的input
  // handleBubbledInput()
  handleWechat()
}
