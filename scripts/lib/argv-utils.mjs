export function hasFlag(argv, flag) {
  return argv.includes(flag)
}

export function getArgValue(argv, flag, fallback = null) {
  const index = argv.indexOf(flag)
  if (index === -1) {
    return fallback
  }
  return argv[index + 1] ?? fallback
}

export function toBool(value) {
  return value === true || value === 'true' || value === '1'
}
