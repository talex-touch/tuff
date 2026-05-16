import type { TuffQuery } from "../tuff";

export type { TuffQuery } from "../tuff";

export type PreviewSafetyDependency =
  | "parser"
  | "sandbox"
  | "network"
  | "cache";

export interface PreviewInputSafetyPolicy {
  maxLength: number;
  syntax: string;
  notes?: string;
}

export interface PreviewAbilitySafetyPolicy {
  input: PreviewInputSafetyPolicy;
  dependencies: PreviewSafetyDependency[];
  usesDynamicExecution: boolean;
  usesNetwork: boolean;
  usesCache: boolean;
  replacementPlan?: string;
}

export interface PreviewAbilityInventoryItem {
  id: string;
  label: string;
  owner: "preview-sdk" | "core-app";
  status: "migrated" | "adapter" | "planned";
  priority: number;
  safety: PreviewAbilitySafetyPolicy;
}

export interface PreviewAbilityContext {
  query: TuffQuery;
  signal: AbortSignal;
}

export interface PreviewAbility {
  readonly id: string;
  readonly label?: string;
  readonly priority: number;
  readonly safety: PreviewAbilitySafetyPolicy;
  canHandle: (query: TuffQuery) => boolean | Promise<boolean>;
  execute: (
    context: PreviewAbilityContext,
  ) => Promise<PreviewAbilityResult | null>;
}

export interface PreviewCardRow {
  label: string;
  value: string;
  description?: string;
  copyable?: boolean;
  emphasize?: boolean;
}

export interface PreviewCardSection {
  title?: string;
  rows: PreviewCardRow[];
}

export interface PreviewCardChip {
  label: string;
  value: string;
}

export interface PreviewCardPayload {
  abilityId: string;
  title: string;
  subtitle?: string;
  primaryValue: string;
  primaryLabel?: string;
  primaryUnit?: string;
  secondaryValue?: string;
  secondaryLabel?: string;
  description?: string;
  accentColor?: string;
  badges?: string[];
  chips?: PreviewCardChip[];
  sections?: PreviewCardSection[];
  warnings?: string[];
  meta?: Record<string, any>;
  confidence?: number;
}

export interface PreviewAbilityResult {
  abilityId: string;
  confidence: number;
  payload: PreviewCardPayload;
  durationMs?: number;
}

export interface PreviewResolveOptions {
  query: TuffQuery;
  signal: AbortSignal;
}

export interface PreviewSdk {
  register: (ability: PreviewAbility) => void;
  listAbilities: () => PreviewAbility[];
  listInventory: () => PreviewAbilityInventoryItem[];
  resolve: (
    options: PreviewResolveOptions,
  ) => Promise<PreviewAbilityResult | null>;
}
