import type { Buffer } from 'node:buffer'
import { defineEvent, defineRawEvent } from '../event/builder'

export interface PluginOpenRequest {
  path: string
}

export interface PluginInstallRequest {
  name: string
  buffer: Buffer
  forceUpdate?: boolean
}

export interface PluginInstallResponse {
  status?: string
  msg?: unknown
}

export interface PluginDevInstallRequest {
  path: string
  forceUpdate?: boolean
}

export interface PluginDropInstallRequest {
  name: string
  buffer: Buffer
  size?: number
}

export interface PluginDropManifest {
  name: string
  [key: string]: unknown
}

export type PluginDropInstallResponse =
  | { status: 'error'; msg: string }
  | { status: 'success'; manifest: PluginDropManifest; path: string; msg?: string }

export interface AppOpenerResolveRequest {
  extension: string
}

export interface AppOpenerResolveResponse {
  bundleId: string
  name: string
  logo: string
  path?: string
  lastResolvedAt?: string
}

export const OpenerEvents = {
  plugin: {
    open: defineEvent('plugin')
      .module('opener')
      .event('open')
      .define<PluginOpenRequest, void>(),
  },
  install: {
    request: defineEvent('plugin')
      .module('install')
      .event('request')
      .define<PluginInstallRequest, PluginInstallResponse>(),
    dev: defineEvent('plugin')
      .module('install')
      .event('dev')
      .define<PluginDevInstallRequest, unknown>(),
  },
  drop: {
    install: defineEvent('plugin')
      .module('drop')
      .event('install')
      .define<PluginDropInstallRequest, PluginDropInstallResponse>(),
  },
  app: {
    resolve: defineEvent('opener')
      .module('app')
      .event('resolve')
      .define<AppOpenerResolveRequest, AppOpenerResolveResponse | null>(),
  },
  legacy: {
    openPlugin: defineRawEvent<string, void>('@open-plugin'),
    installPlugin: defineRawEvent<PluginInstallRequest, PluginInstallResponse>('@install-plugin'),
    installDevPlugin: defineRawEvent<PluginDevInstallRequest, unknown>('plugin:install-dev'),
    dropPlugin: defineRawEvent<PluginDropInstallRequest, PluginDropInstallResponse>('drop:plugin'),
    resolveApp: defineRawEvent<AppOpenerResolveRequest, AppOpenerResolveResponse | null>(
      'openers:resolve',
    ),
  },
} as const
