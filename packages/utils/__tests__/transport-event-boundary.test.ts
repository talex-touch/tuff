import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const EVENT_SOURCE_FILES = [
  'transport/events/index.ts',
  'transport/events/app.ts',
  'transport/events/assistant.ts',
] as const

function collectThreePartRawEvents(source: string): string[] {
  const rawEventPattern = /defineRawEvent(?:<[^]*?>)?\(\s*['"]([^'"]+)['"]/g
  const events: string[] = []
  let match = rawEventPattern.exec(source)

  while (match !== null) {
    const eventName = match[1]
    if (eventName.split(':').length >= 3) {
      events.push(eventName)
    }
    match = rawEventPattern.exec(source)
  }

  return events
}

describe('transport event boundary', () => {
  it('does not use defineRawEvent for event names that fit typed builder shape', () => {
    const violations = EVENT_SOURCE_FILES.flatMap((relativePath) => {
      const source = readFileSync(resolve(__dirname, '..', relativePath), 'utf8')
      return collectThreePartRawEvents(source).map(eventName => `${relativePath}: ${eventName}`)
    })

    expect(violations).toEqual([])
  })
})
