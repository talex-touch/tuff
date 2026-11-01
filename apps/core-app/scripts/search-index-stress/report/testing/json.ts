/** Every number in a JSON-shaped value, with the path it sits at. */
export function numbersIn(value: unknown, path = '$'): Array<[string, number]> {
  if (typeof value === 'number') return [[path, value]]
  if (Array.isArray(value))
    return value.flatMap((item, index) => numbersIn(item, `${path}[${index}]`))
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, item]) => numbersIn(item, `${path}.${key}`))
  return []
}
