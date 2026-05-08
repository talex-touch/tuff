import type { TuffEvent } from '../types'

class TuffEventNamespaceBuilder<TNamespace extends string> {
  constructor(private readonly namespace: TNamespace) {}

  module<TModule extends string>(module: TModule): TuffEventModuleBuilder<TNamespace, TModule> {
    assertNonEmptyString(module, 'module')
    return new TuffEventModuleBuilder(this.namespace, module)
  }
}

class TuffEventModuleBuilder<TNamespace extends string, TModule extends string> {
  constructor(
    private readonly namespace: TNamespace,
    private readonly moduleName: TModule,
  ) {}

  event<TAction extends string>(action: TAction): TuffEventActionBuilder<TNamespace, TModule, TAction> {
    assertNonEmptyString(action, 'action')
    return new TuffEventActionBuilder(this.namespace, this.moduleName, action)
  }
}

class TuffEventActionBuilder<
  TNamespace extends string,
  TModule extends string,
  TAction extends string,
> {
  constructor(
    private readonly namespace: TNamespace,
    private readonly moduleName: TModule,
    private readonly action: TAction,
  ) {}

  define<TRequest = void, TResponse = void>(): TuffEvent<TRequest, TResponse> {
    return createEvent(`${this.namespace}:${this.moduleName}:${this.action}`)
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (!value || typeof value !== 'string') {
    throw new Error(`[tuff-intelligence] ${field} must be a non-empty string.`)
  }
}

function createEvent<TRequest = void, TResponse = void>(eventName: string): TuffEvent<TRequest, TResponse> {
  return Object.freeze({
    toEventName: () => eventName,
  }) as TuffEvent<TRequest, TResponse>
}

export function defineEvent<TNamespace extends string>(
  namespace: TNamespace,
): TuffEventNamespaceBuilder<TNamespace> {
  assertNonEmptyString(namespace, 'namespace')
  return new TuffEventNamespaceBuilder(namespace)
}
