/**
 * Computes the Levenshtein distance between two strings.
 * This is a standard dynamic programming implementation.
 *
 * @param s1 The first string.
 * @param s2 The second string.
 * @returns The Levenshtein distance.
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length
  const n = s2.length

  // Create a 2D array (m+1)x(n+1) to store distances
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0))

  // Initialize the DP table
  for (let i = 0; i <= m; i++) {
    const row = dp[i]
    if (row)
      row[0] = i
  }
  const firstRow = dp[0]
  if (firstRow) {
    for (let j = 0; j <= n; j++)
      firstRow[j] = j
  }

  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      const row = dp[i]
      const prevRow = dp[i - 1]
      if (!row || !prevRow)
        continue
      row[j] = Math.min(
        (prevRow[j] ?? 0) + 1, // Deletion
        (row[j - 1] ?? 0) + 1, // Insertion
        (prevRow[j - 1] ?? 0) + cost, // Substitution
      )
    }
  }

  return dp[m]?.[n] ?? 0
}
