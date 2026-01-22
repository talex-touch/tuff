import { screen } from 'electron'
import type { Display } from 'electron'

export function getAllDisplays(
  filter: (display: Display, index: number, array: Display[]) => boolean
): Display[] {
  const displays = screen.getAllDisplays()
  return displays.filter(filter)
}
