export function toCssUnit(value: string | number): string {
  return typeof value === 'number' ? `${value}px` : value
}
