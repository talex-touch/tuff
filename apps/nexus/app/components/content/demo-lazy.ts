export const DEMO_LAZY_ROOT_MARGIN = '480px 0px'

export interface DemoIntersectionSnapshot {
  isIntersecting: boolean
  intersectionRatio: number
}

export function shouldActivateDemo(
  isActive: boolean,
  entry: DemoIntersectionSnapshot,
) {
  return isActive || entry.isIntersecting || entry.intersectionRatio > 0
}
