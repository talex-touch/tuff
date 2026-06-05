type BetterScrollConstructor = {
  use: (...args: any[]) => unknown
}

let isPullDownInstalled = false
let isPullUpInstalled = false

export async function installBetterScrollPullDown(BScroll: BetterScrollConstructor) {
  if (isPullDownInstalled)
    return

  const { default: PullDown } = await import('@better-scroll/pull-down')
  BScroll.use(PullDown)
  isPullDownInstalled = true
}

export async function installBetterScrollPullUp(BScroll: BetterScrollConstructor) {
  if (isPullUpInstalled)
    return

  const { default: PullUp } = await import('@better-scroll/pull-up')
  BScroll.use(PullUp)
  isPullUpInstalled = true
}
