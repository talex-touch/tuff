import { anyStr2Num, num2anyStr } from 'utils/common'
import { genFileTree } from "@talex-touch/utils/help/tree-generator";
import { describe, expect, it, vi } from "vitest";
import path from 'path'

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

describe("#File tree", () => {
  it("file tree generator test", () => {
    const p = path.join(process.cwd(), '..', '..')

    genFileTree(p);
  });
});