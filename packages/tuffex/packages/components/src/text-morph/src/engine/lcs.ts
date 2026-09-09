// Ported from torph/src/lib/utils/lcs.ts (https://github.com/lochie/torph).
// MIT License © lochie. Kept intentionally close to upstream so its fixes stay
// diffable; deviations are limited to tuffex lint style and strict-TS hardening.

/**
 * Longest common subsequence as paired indices. Walked forwards so ties go to the
 * earliest match — backwards, a repeated word flies across the block.
 */
export function lcsIndices(a: string[], b: string[]): [number[], number[]] {
  const m = a.length
  const n = b.length
  // dp[i][j] = length of the LCS of a[i..] and b[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[])

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j]
        ? dp[i + 1]![j + 1]! + 1
        : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }

  const ai: number[] = []
  const bi: number[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ai.push(i)
      bi.push(j)
      i++
      j++
    }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      i++
    }
    else {
      j++
    }
  }

  return [ai, bi]
}
