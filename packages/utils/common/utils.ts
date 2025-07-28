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

/**
 * Serializes a value to JSON, throwing a detailed error on the first unsupported value (like a function, DOM node, symbol, etc.).
 * Reports the exact path to the error.
 *
 * @param value - Any JS value.
 * @returns The JSON string if serialization succeeds.
 * @throws Error if an unsupported value is found (reports path and type).
 */
export function structuredStrictStringify(value: unknown): string {
  const seen = new WeakMap<object, string>();
  const badTypes = [
    'symbol'
  ];
  // Support Map/Set, but not Error, DOM, Proxy, WeakMap, WeakSet
  function getType(val: any): string {
    if (val === null) return 'null';
    if (Array.isArray(val)) return 'Array';
    if (typeof Document !== 'undefined') {
      if (val instanceof Node) return 'DOMNode';
    }
    if (val instanceof Error) return 'Error';
    if (val instanceof WeakMap) return 'WeakMap';
    if (val instanceof WeakSet) return 'WeakSet';
    if (typeof val === 'object' && val !== null && val.constructor?.name === 'Proxy') return 'Proxy';
    if (typeof val === 'bigint') return 'BigInt';
    return typeof val;
  }

  function serialize(val: any, path: string): any {
    const type = getType(val);
    // Block disallowed/unsafe types and edge cases for structured-clone
    if (badTypes.includes(typeof val) || type === 'DOMNode' || type === 'Error' || type === 'Proxy' || type === 'WeakMap' || type === 'WeakSet' || type === 'BigInt') {
      throw new Error(`Cannot serialize property at path "${path}": type "${type}"`);
    }
    // JSON doesn't support undefined, skip it for values in objects, preserve in arrays as null
    if (typeof val === 'undefined') return null;
    // Simple value
    if (
      val === null ||
      typeof val === 'number' ||
      typeof val === 'boolean' ||
      typeof val === 'string'
    ) return val;
    // Cycle check
    if (typeof val === 'object') {
      if (seen.has(val)) {
        return `[Circular ~${seen.get(val)}]`; // You could just throw if you dislike this fallback!
      }
      seen.set(val, path);
      if (Array.isArray(val)) {
        return val.map((item, idx) => serialize(item, `${path}[${idx}]`));
      }
      if (val instanceof Date) {
        return val.toISOString();
      }
      if (val instanceof Map) {
        const obj: Record<string, any> = {};
        for (const [k, v] of val.entries()) {
          obj[typeof k === 'string' ? k : JSON.stringify(k)] = serialize(v, `${path}[Map(${typeof k === 'string' ? k : JSON.stringify(k)})]`);
        }
        return obj;
      }
      if (val instanceof Set) {
        return Array.from(val).map((item, idx) => serialize(item, `${path}[SetEntry${idx}]`));
      }
      // General object
      const res: any = {};
      for (const key of Object.keys(val)) {
        res[key] = serialize(val[key], `${path}.${key}`);
      }
      return res;
    }
    throw new Error(`Cannot serialize property at path "${path}": unknown type`);
  }

  return JSON.stringify(serialize(value, 'root'));
}
