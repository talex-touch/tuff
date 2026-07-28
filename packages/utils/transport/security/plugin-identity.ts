import type {
  PluginActivationIdentity,
  PluginCallerAuthority,
  PluginCallerIdentity,
  PluginSecurityContext,
} from "../types";

const issuedIdentities = new WeakSet<object>();

interface IdentityBinding {
  senderId?: number;
  portId?: string;
  hostGeneration?: number;
}

function issueIdentity(
  activation: PluginActivationIdentity,
  authority: PluginCallerAuthority,
  binding: IdentityBinding = {},
): PluginCallerIdentity {
  const identity = Object.freeze({
    pluginName: activation.name,
    pluginInstanceId: activation.pluginInstanceId,
    activationGeneration: activation.activationGeneration,
    authority,
    ...binding,
  }) satisfies PluginCallerIdentity;
  issuedIdentities.add(identity);
  return identity;
}

export function issuePluginSecurityContext(
  activation: PluginActivationIdentity,
  authority: Exclude<PluginCallerAuthority, "test">,
  binding: IdentityBinding = {},
): PluginSecurityContext {
  return {
    name: activation.name,
    uniqueKey: activation.key,
    identity: issueIdentity(activation, authority, binding),
  };
}

export function createTrustedTestPluginContext(input: {
  name: string;
  pluginInstanceId?: string;
  activationGeneration?: number;
  uniqueKey?: string;
}): PluginSecurityContext {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error(
      "Trusted test plugin contexts are only available in test runtime",
    );
  }

  const activation: PluginActivationIdentity = {
    name: input.name,
    pluginInstanceId: input.pluginInstanceId ?? `test:${input.name}`,
    activationGeneration: input.activationGeneration ?? 1,
    key: input.uniqueKey ?? `test-key:${input.name}`,
  };
  return {
    name: activation.name,
    uniqueKey: activation.key,
    identity: issueIdentity(activation, "test"),
  };
}

export function isAuthoritativePluginContext(
  context: PluginSecurityContext | null | undefined,
): context is PluginSecurityContext & { identity: PluginCallerIdentity } {
  const identity = context?.identity;
  if (!identity || !issuedIdentities.has(identity)) {
    return false;
  }
  return (
    identity.pluginName === context.name &&
    identity.pluginInstanceId.length > 0 &&
    Number.isInteger(identity.activationGeneration) &&
    identity.activationGeneration > 0
  );
}
