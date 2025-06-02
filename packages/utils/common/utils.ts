/**
 * Delays execution for a given amount of milliseconds.
 *
 * @param time - Time to sleep in milliseconds.
 * @returns A promise that resolves with the same time value after the delay.
 *
 * @example
 * ```ts
 * await sleep(1000); // Waits for 1 second
 * ```
 */
export async function sleep(time: number): Promise<number> {
    return new Promise(resolve => setTimeout(() => resolve(time), time))
}

/**
 * Encodes any string into a `bigint` by converting each character's char code
 * into a relative offset based on the minimum char code in the string.
 *
 * Format: `{minCharCode}000{paddedOffsetPairs}`
 *
 * @param str - Any input string to encode.
 * @returns A BigInt representation of the input string.
 *
 * @example
 * ```ts
 * const encoded = anyStr2Num("abc"); // e.g., 970000000102
 * ```
 */
export function anyStr2Num(str: string): bigint {
    const codes = Array.from(str).map(ch => ch.charCodeAt(0))
    const minCode = Math.min(...codes)

    const encoded = codes
        .map(code => (code - minCode).toString().padStart(2, '0'))
        .join('')

    return BigInt(`${minCode}000${encoded}`)
}

/**
 * Decodes a BigInt back into the original string.
 * Assumes the format produced by `anyStr2Num`.
 *
 * @param num - The BigInt to decode.
 * @returns The original decoded string.
 *
 * @example
 * ```ts
 * const decoded = num2anyStr(970000000102n); // returns "abc"
 * ```
 */
export function num2anyStr(num: bigint): string {
    const [baseStr, encoded] = num.toString().split('000')
    const base = Number(baseStr)

    let result = ''
    for (let i = 0; i < encoded.length; i += 2) {
        const offset = Number(encoded.slice(i, i + 2))
        result += String.fromCharCode(base + offset)
    }

    return result
}

const LOCALHOST_KEYS = ['localhost', '127.0.0.1']

/**
 * Determines whether a given URL string points to localhost.
 *
 * @param urlStr - The full URL string to check.
 * @returns `true` if the URL hostname is `localhost` or `127.0.0.1`, otherwise `false`.
 *
 * @example
 * ```ts
 * isLocalhostUrl("http://localhost:3000"); // true
 * isLocalhostUrl("https://example.com");   // false
 * ```
 */
export function isLocalhostUrl(urlStr: string): boolean {
    return LOCALHOST_KEYS.includes(new URL(urlStr).hostname)
}