import type { SVGProps } from 'react'

export type BuiltinIconName
  = | 'check'
    | 'check-circle'
    | 'alert-triangle'
    | 'x-circle'
    | 'info'
    | 'close'
    | 'chevron-down'
    | 'user'
    | 'search'
    | 'plus'

interface BuiltinIconSpec {
  viewBox: string
  path: string
  stroke?: number
}

const BUILTIN_ICONS: Record<BuiltinIconName, BuiltinIconSpec> = {
  'check': {
    viewBox: '0 0 24 24',
    path: 'M10 15.172L19.192 5.979L20.607 7.393L10 18L3.636 11.636L5.05 10.222L10 15.172Z',
  },
  'check-circle': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1.3 12.3L6.4 12l1.4-1.4 2.9 2.9 5.6-5.6 1.4 1.4z',
  },
  'x-circle': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm3.5 4.1L12 11.6 8.5 8.1 7.1 9.5l3.5 3.5-3.5 3.5 1.4 1.4 3.5-3.5 3.5 3.5 1.4-1.4-3.5-3.5 3.5-3.5z',
  },
  'alert-triangle': {
    viewBox: '0 0 24 24',
    path: 'M12 2 1.5 20.5h21zm0 4.2L19 18.5H5zm-1 3.8h2v4.5h-2zm0 5.8h2v2h-2z',
  },
  'info': {
    viewBox: '0 0 24 24',
    path: 'M12 2a10 10 0 100 20 10 10 0 000-20zm0 2a8 8 0 110 16 8 8 0 010-16zm-1 3h2v2h-2V7zm0 4h2v6h-2v-6z',
  },
  'close': {
    viewBox: '0 0 24 24',
    path: 'M12 10.586l4.95-4.95 1.414 1.414-4.95 4.95 4.95 4.95-1.414 1.414-4.95-4.95-4.95 4.95-1.414-1.414 4.95-4.95-4.95-4.95L7.05 5.636z',
  },
  'chevron-down': {
    viewBox: '0 0 24 24',
    path: 'M6 9.5 12 15.5 18 9.5',
    stroke: 1.75,
  },
  'user': {
    viewBox: '0 0 24 24',
    path: 'M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-4.418 0-8 2.239-8 5v1h16v-1c0-2.761-3.582-5-8-5z',
  },
  'search': {
    viewBox: '0 0 24 24',
    path: 'M10 2a8 8 0 105.293 14.293l4.707 4.707 1.414-1.414-4.707-4.707A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z',
  },
  'plus': {
    viewBox: '0 0 24 24',
    path: 'M12 5V19M5 12H19',
    stroke: 1.75,
  },
}

export function BuiltinIcon({
  name,
  className,
  size,
  ...rest
}: { name: string, size?: number } & SVGProps<SVGSVGElement>) {
  const spec = BUILTIN_ICONS[name as BuiltinIconName]
  if (!spec) {
    return <i className={`${name}${className ? ` ${className}` : ''}`} aria-hidden="true" />
  }
  const dim = size ?? '1em'
  return (
    <svg
      className={className}
      viewBox={spec.viewBox}
      width={dim}
      height={dim}
      fill={spec.stroke ? 'none' : 'currentColor'}
      stroke={spec.stroke ? 'currentColor' : undefined}
      strokeWidth={spec.stroke}
      strokeLinecap={spec.stroke ? 'round' : undefined}
      strokeLinejoin={spec.stroke ? 'round' : undefined}
      aria-hidden="true"
      {...rest}
    >
      <path d={spec.path} />
    </svg>
  )
}

export function OsIcon({ os, className }: { os: 'macos' | 'windows' | 'linux', className?: string }) {
  if (os === 'windows') {
    return (
      <svg className={className ? `tx-os-icon ${className}` : 'tx-os-icon'} viewBox="0 0 256 256" aria-hidden="true">
        <path
          fill="currentColor"
          d="M0 0h121.33v121.33H0V0Zm134.67 0H256v121.33H134.67V0ZM0 134.67h121.33V256H0V134.67Zm134.67 0H256V256H134.67V134.67Z"
        />
      </svg>
    )
  }
  if (os === 'linux') {
    return (
      <svg className={className ? `tx-os-icon ${className}` : 'tx-os-icon'} viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 2.25c-2.42 0-4.39 2.1-4.39 4.68 0 1.09.26 2.13.68 3.03-.66.87-1.07 1.95-1.07 3.13 0 2.65 2.14 4.8 4.78 4.8s4.78-2.15 4.78-4.8c0-1.18-.41-2.26-1.07-3.13.42-.9.68-1.94.68-3.03 0-2.58-1.97-4.68-4.39-4.68Zm-1.52 4.1c.5 0 .9.42.9.94s-.4.94-.9.94-.9-.42-.9-.94.4-.94.9-.94Zm3.04 0c.5 0 .9.42.9.94s-.4.94-.9.94-.9-.42-.9-.94.4-.94.9-.94Zm-5.4 11.74c-1.31.54-2.65 1.06-3.2.2-.48-.75.25-1.85 1.5-2.56.36 1 .95 1.84 1.7 2.36Zm7.76 0c.75-.52 1.34-1.36 1.7-2.36 1.25.71 1.98 1.81 1.5 2.56-.55.86-1.89.34-3.2-.2ZM12 10.1c.93 0 1.88.38 2.55 1.02.49.47.73 1.06.73 1.74 0 1.8-1.47 3.26-3.28 3.26s-3.28-1.46-3.28-3.26c0-.68.24-1.27.73-1.74A3.7 3.7 0 0 1 12 10.1Z"
        />
      </svg>
    )
  }
  return (
    <svg className={className ? `tx-os-icon ${className}` : 'tx-os-icon'} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.37 1.43c0 1.14-.47 2.24-1.29 3.05-.84.82-2.2 1.46-3.3 1.37-.14-1.1.49-2.28 1.25-3.05.84-.85 2.3-1.48 3.34-1.37ZM20.98 17.14c-.57 1.31-.84 1.89-1.58 3.05-1.03 1.6-2.48 3.6-4.28 3.62-1.6.02-2.01-1.04-4.18-1.03-2.17.01-2.62 1.05-4.22 1.04-1.8-.02-3.17-1.82-4.2-3.42-2.88-4.47-3.18-9.72-1.4-12.51 1.27-1.99 3.27-3.16 5.16-3.16 1.92 0 3.13 1.05 4.72 1.05 1.54 0 2.48-1.06 4.7-1.06 1.68 0 3.46.91 4.72 2.49-4.15 2.27-3.48 8.2.56 9.93Z"
      />
    </svg>
  )
}
