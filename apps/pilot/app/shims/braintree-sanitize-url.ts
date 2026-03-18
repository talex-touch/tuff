import sanitizeUrlCjs from '@braintree/sanitize-url/dist/index.js'

type SanitizeUrlFn = (url: string) => string

const sanitizeUrlValue = sanitizeUrlCjs as
  | SanitizeUrlFn
  | { sanitizeUrl?: SanitizeUrlFn, default?: SanitizeUrlFn | { sanitizeUrl?: SanitizeUrlFn } }

const sanitizeUrl: SanitizeUrlFn = typeof sanitizeUrlValue === 'function'
  ? sanitizeUrlValue
  : typeof sanitizeUrlValue?.sanitizeUrl === 'function'
    ? sanitizeUrlValue.sanitizeUrl
    : typeof sanitizeUrlValue?.default === 'function'
      ? sanitizeUrlValue.default
      : typeof sanitizeUrlValue?.default?.sanitizeUrl === 'function'
        ? sanitizeUrlValue.default.sanitizeUrl
        : (value: string) => value

export {
  sanitizeUrl,
}

export default sanitizeUrl
