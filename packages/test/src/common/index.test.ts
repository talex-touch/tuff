import { anyStr2Num, num2anyStr } from 'utils/common'
import { describe, expect, it, vi } from "vitest";

describe("#Common", () => {
  it('serial str-num test', () => {
    const testWord = 'test'
    
    const num = anyStr2Num(testWord)

    expect(num).not.toBeNaN()
    expect(num).toBe(BigInt(10100015001415))

    const str = num2anyStr(num)

    expect(str).toBe(testWord)

  })
})