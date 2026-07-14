import type { AppLocale } from "./locale";
import type {
  DomainLexiconDomain,
  DomainLexiconEntry,
  DomainLexiconMatch,
  DomainLexiconSearchOptions,
  ResolvedDomainLexiconEntry,
} from "./lexicon";
import { DomainLexiconRegistry } from "./lexicon";

export const MAX_PLUGIN_LEXICON_ENTRIES = 100;
export const MAX_PLUGIN_LEXICON_REGISTER_BATCH = 50;
export const MAX_PLUGIN_LEXICON_REGISTER_BYTES = 256 * 1024;

export type PluginDomainLexiconEntryInput = Omit<
  DomainLexiconEntry,
  "id" | "source"
> & {
  id: string;
};

export interface PluginLexiconRegisterOptions {
  replace?: boolean;
}

export interface PluginLexiconRegisterResult {
  namespace: string;
  ids: string[];
  registered: number;
  total: number;
}

export interface PluginLexiconResolveOptions {
  locale?: AppLocale;
  domain?: DomainLexiconDomain;
}

interface PluginLexiconState {
  entriesByLocalId: Map<string, DomainLexiconEntry>;
  registry: DomainLexiconRegistry;
}

export class ScopedDomainLexiconRegistry {
  private readonly scoped = new Map<string, PluginLexiconState>();

  constructor(private readonly official: DomainLexiconRegistry) {}

  getNamespace(pluginId: string): string {
    return `plugin:${normalizePluginId(pluginId)}:`;
  }

  register(
    pluginIdInput: string,
    entries: readonly PluginDomainLexiconEntryInput[],
    options: PluginLexiconRegisterOptions = {},
  ): PluginLexiconRegisterResult {
    const pluginId = normalizePluginId(pluginIdInput);
    validateBatch(entries);

    const namespace = this.getNamespace(pluginId);
    const source = `plugin:${pluginId}` as const;
    const previous = this.scoped.get(pluginId);
    const staged = options.replace
      ? new Map<string, DomainLexiconEntry>()
      : new Map(previous?.entriesByLocalId ?? []);
    const incomingIds = new Set<string>();
    const registeredIds: string[] = [];

    for (const input of entries) {
      const localId = normalizeLocalId(input.id);
      if (incomingIds.has(localId)) {
        throw new Error(`Duplicate plugin lexicon id: ${localId}`);
      }
      incomingIds.add(localId);

      if (this.official.resolve(localId)) {
        throw new Error(
          `Official domain lexicon id cannot be registered: ${localId}`,
        );
      }

      const { id: _localId, ...entryInput } = input;
      const effectiveId = `${namespace}${localId}`;
      const entry: DomainLexiconEntry = {
        ...entryInput,
        id: effectiveId,
        source,
      };
      staged.set(localId, entry);
      registeredIds.push(effectiveId);
    }

    if (staged.size > MAX_PLUGIN_LEXICON_ENTRIES) {
      throw new Error(
        `Plugin lexicon entry limit exceeded: ${staged.size}/${MAX_PLUGIN_LEXICON_ENTRIES}`,
      );
    }

    const registry = new DomainLexiconRegistry(Array.from(staged.values()));
    if (staged.size === 0) {
      this.scoped.delete(pluginId);
    } else {
      this.scoped.set(pluginId, { entriesByLocalId: staged, registry });
    }

    return {
      namespace,
      ids: registeredIds,
      registered: registeredIds.length,
      total: staged.size,
    };
  }

  resolve(
    pluginIdInput: string,
    idInput: string,
    options: PluginLexiconResolveOptions = {},
  ): ResolvedDomainLexiconEntry | null {
    const pluginId = normalizePluginId(pluginIdInput);
    const id = normalizeLookupId(idInput);
    if (!id) return null;

    const official = this.official.resolve(id, options.locale);
    if (official && matchesDomain(official.entry, options.domain)) {
      return official;
    }

    const state = this.scoped.get(pluginId);
    if (!state) return null;

    const namespace = this.getNamespace(pluginId);
    const scopedId = id.startsWith(namespace)
      ? id
      : id.startsWith("plugin:")
        ? ""
        : `${namespace}${id}`;
    if (!scopedId) return null;

    const resolved = state.registry.resolve(scopedId, options.locale);
    return resolved && matchesDomain(resolved.entry, options.domain)
      ? resolved
      : null;
  }

  search(
    pluginIdInput: string,
    query: string,
    options: DomainLexiconSearchOptions = {},
  ): DomainLexiconMatch[] {
    const pluginId = normalizePluginId(pluginIdInput);
    const limit = normalizeLimit(options.limit);
    if (limit === 0) return [];

    const searchOptions = { ...options, limit: 100 };
    const matches = this.official.search(query, searchOptions);
    const scopedRegistry = this.scoped.get(pluginId)?.registry;
    if (scopedRegistry) {
      matches.push(...scopedRegistry.search(query, searchOptions));
    }

    const bestById = new Map<string, DomainLexiconMatch>();
    for (const match of matches) {
      const current = bestById.get(match.entry.id);
      if (!current || compareMatches(match, current) < 0) {
        bestById.set(match.entry.id, match);
      }
    }

    return Array.from(bestById.values()).sort(compareMatches).slice(0, limit);
  }

  clear(pluginIdInput: string): boolean {
    return this.scoped.delete(normalizePluginId(pluginIdInput));
  }
}

function validateBatch(
  entries: readonly PluginDomainLexiconEntryInput[],
): void {
  if (!Array.isArray(entries)) {
    throw new Error("Plugin lexicon entries must be an array");
  }
  if (entries.length > MAX_PLUGIN_LEXICON_REGISTER_BATCH) {
    throw new Error(
      `Plugin lexicon register batch limit exceeded: ${entries.length}/${MAX_PLUGIN_LEXICON_REGISTER_BATCH}`,
    );
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(entries);
  } catch {
    throw new Error("Plugin lexicon entries must be JSON-serializable");
  }
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  if (byteLength > MAX_PLUGIN_LEXICON_REGISTER_BYTES) {
    throw new Error(
      `Plugin lexicon register payload too large: ${byteLength}/${MAX_PLUGIN_LEXICON_REGISTER_BYTES}`,
    );
  }
}

function normalizePluginId(value: string): string {
  const pluginId = typeof value === "string" ? value.trim() : "";
  if (!pluginId || pluginId.includes(":")) {
    throw new Error("Plugin lexicon requires a valid plugin id");
  }
  return pluginId;
}

function normalizeLocalId(value: string): string {
  const localId = typeof value === "string" ? value.trim() : "";
  if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(localId)) {
    throw new Error(`Invalid plugin lexicon local id: ${localId || "<empty>"}`);
  }
  if (localId.startsWith("plugin:")) {
    throw new Error("Plugin lexicon ids must be local, not host-prefixed");
  }
  return localId;
}

function normalizeLookupId(value: string): string {
  return typeof value === "string" ? value.trim() : "";
}

function matchesDomain(
  entry: DomainLexiconEntry,
  domain: DomainLexiconDomain | undefined,
): boolean {
  return domain === undefined || entry.domain === domain;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(0, Math.floor(limit)));
}

function compareMatches(
  left: DomainLexiconMatch,
  right: DomainLexiconMatch,
): number {
  if (left.score !== right.score) return right.score - left.score;
  const idOrder = left.entry.id.localeCompare(right.entry.id);
  if (idOrder !== 0) return idOrder;
  return left.matchedAlias.localeCompare(right.matchedAlias);
}
