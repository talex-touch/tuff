import type { AppLocale } from "./locale";
import type { LocalizedList, LocalizedText } from "./localized";
import { APP_LOCALES, DEFAULT_APP_LOCALE } from "./locale";
import { resolveLocalizedList, resolveLocalizedText } from "./localized";

export const DOMAIN_LEXICON_DOMAINS = [
  "unit",
  "currency",
  "timezone",
  "capability",
  "fileType",
  "systemAction",
] as const;

export type DomainLexiconDomain = (typeof DOMAIN_LEXICON_DOMAINS)[number];

export type DomainLexiconSource =
  | "builtin"
  | `catalog:${string}`
  | `plugin:${string}`;

export interface DomainLexiconEntry {
  id: string;
  domain: DomainLexiconDomain;
  source: DomainLexiconSource;
  version: string;
  labels: LocalizedText;
  aliases: LocalizedList;
  searchBoost?: Partial<Record<AppLocale, number>>;
  deprecated?: boolean;
  replacedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface DomainLexiconSearchOptions {
  locale?: AppLocale;
  domain?: DomainLexiconDomain;
  limit?: number;
}

export interface ResolvedDomainLexiconEntry {
  entry: DomainLexiconEntry;
  label: string;
  aliases: string[];
}

export interface DomainLexiconMatch extends ResolvedDomainLexiconEntry {
  matchedAlias: string;
  matchedLocale?: AppLocale;
  score: number;
}

type CandidateSource = "id" | "label" | "alias";

interface AliasCandidate {
  entry: DomainLexiconEntry;
  alias: string;
  foldedAlias: string;
  locale?: AppLocale;
  source: CandidateSource;
}

interface RankedCandidate extends AliasCandidate {
  score: number;
}

export class DomainLexiconRegistry {
  private readonly entries: readonly DomainLexiconEntry[];
  private readonly entriesById = new Map<string, DomainLexiconEntry>();
  private readonly exactAliases = new Map<string, AliasCandidate[]>();
  private readonly foldedAliases = new Map<string, AliasCandidate[]>();
  private readonly candidateKeys = new Set<string>();
  private readonly candidates: readonly AliasCandidate[];

  constructor(entries: readonly DomainLexiconEntry[]) {
    const candidates: AliasCandidate[] = [];

    this.entries = Object.freeze(
      entries.map((sourceEntry) => {
        const entry = cloneEntry(sourceEntry);
        if (this.entriesById.has(entry.id)) {
          throw new Error(`Duplicate domain lexicon id: ${entry.id}`);
        }
        this.entriesById.set(entry.id, entry);

        this.indexCandidate(candidates, entry, entry.id, undefined, "id");
        this.indexCandidate(
          candidates,
          entry,
          entry.labels.default,
          undefined,
          "label",
        );
        for (const locale of APP_LOCALES) {
          const label = entry.labels.locales?.[locale];
          if (label)
            this.indexCandidate(candidates, entry, label, locale, "label");
        }

        for (const alias of entry.aliases.default) {
          this.indexCandidate(candidates, entry, alias, undefined, "alias");
        }
        for (const locale of APP_LOCALES) {
          for (const alias of entry.aliases.locales?.[locale] ?? []) {
            this.indexCandidate(candidates, entry, alias, locale, "alias");
          }
        }

        return entry;
      }),
    );
    this.candidates = Object.freeze(candidates);
  }

  resolve(
    id: string,
    locale: AppLocale = DEFAULT_APP_LOCALE,
  ): ResolvedDomainLexiconEntry | null {
    const entry = this.entriesById.get(id.trim());
    if (!entry) return null;

    return this.resolveEntry(entry, locale);
  }

  matchAlias(
    input: string,
    options: DomainLexiconSearchOptions = {},
  ): DomainLexiconMatch | null {
    const query = normalizeText(input);
    if (!query) return null;

    const locale = options.locale ?? DEFAULT_APP_LOCALE;
    const exact = this.exactAliases.get(query) ?? [];
    const candidates =
      exact.length > 0
        ? exact
        : (this.foldedAliases.get(foldText(query)) ?? []);
    const ranked = this.rankCandidates(
      candidates,
      query,
      locale,
      options.domain,
      "exact",
    );
    const match = ranked[0];
    return match ? this.toMatch(match, locale) : null;
  }

  search(
    queryInput: string,
    options: DomainLexiconSearchOptions = {},
  ): DomainLexiconMatch[] {
    const query = normalizeText(queryInput);
    if (!query) return [];

    const locale = options.locale ?? DEFAULT_APP_LOCALE;
    const foldedQuery = foldText(query);
    const ranked: RankedCandidate[] = [];

    for (const candidate of this.candidates) {
      if (options.domain && candidate.entry.domain !== options.domain) continue;

      let matchType: "exact" | "prefix" | "contains" | null = null;
      if (candidate.alias === query || candidate.foldedAlias === foldedQuery) {
        matchType = "exact";
      } else if (candidate.foldedAlias.startsWith(foldedQuery)) {
        matchType = "prefix";
      } else if (candidate.foldedAlias.includes(foldedQuery)) {
        matchType = "contains";
      }
      if (!matchType) continue;

      ranked.push({
        ...candidate,
        score: scoreCandidate(candidate, query, locale, matchType),
      });
    }

    const bestByEntry = new Map<string, RankedCandidate>();
    for (const candidate of ranked) {
      const current = bestByEntry.get(candidate.entry.id);
      if (!current || compareRankedCandidates(candidate, current) < 0) {
        bestByEntry.set(candidate.entry.id, candidate);
      }
    }

    const limit = normalizeLimit(options.limit);
    if (limit === 0) return [];

    return Array.from(bestByEntry.values())
      .sort(compareRankedCandidates)
      .slice(0, limit)
      .map((candidate) => this.toMatch(candidate, locale));
  }

  list(domain?: DomainLexiconDomain): readonly DomainLexiconEntry[] {
    if (!domain) return this.entries;
    return Object.freeze(
      this.entries.filter((entry) => entry.domain === domain),
    );
  }

  private indexCandidate(
    candidates: AliasCandidate[],
    entry: DomainLexiconEntry,
    rawAlias: string,
    locale: AppLocale | undefined,
    source: CandidateSource,
  ): void {
    const alias = normalizeText(rawAlias);
    if (!alias) return;

    const candidate: AliasCandidate = Object.freeze({
      entry,
      alias,
      foldedAlias: foldText(alias),
      locale,
      source,
    });
    const key = `${entry.id}\u0000${source}\u0000${locale ?? "default"}\u0000${alias}`;
    if (this.candidateKeys.has(key)) return;
    this.candidateKeys.add(key);

    candidates.push(candidate);
    appendCandidate(this.exactAliases, alias, candidate);
    appendCandidate(this.foldedAliases, candidate.foldedAlias, candidate);
  }

  private rankCandidates(
    candidates: readonly AliasCandidate[],
    query: string,
    locale: AppLocale,
    domain: DomainLexiconDomain | undefined,
    matchType: "exact" | "prefix" | "contains",
  ): RankedCandidate[] {
    const bestByEntry = new Map<string, RankedCandidate>();

    for (const candidate of candidates) {
      if (domain && candidate.entry.domain !== domain) continue;
      const ranked = {
        ...candidate,
        score: scoreCandidate(candidate, query, locale, matchType),
      };
      const current = bestByEntry.get(candidate.entry.id);
      if (!current || compareRankedCandidates(ranked, current) < 0) {
        bestByEntry.set(candidate.entry.id, ranked);
      }
    }

    return Array.from(bestByEntry.values()).sort(compareRankedCandidates);
  }

  private resolveEntry(
    entry: DomainLexiconEntry,
    locale: AppLocale,
  ): ResolvedDomainLexiconEntry {
    const aliases = uniqueStrings([
      ...entry.aliases.default,
      ...resolveLocalizedList(entry.aliases, locale),
    ]);
    return {
      entry,
      label: resolveLocalizedText(entry.labels, locale),
      aliases,
    };
  }

  private toMatch(
    candidate: RankedCandidate,
    locale: AppLocale,
  ): DomainLexiconMatch {
    return {
      ...this.resolveEntry(candidate.entry, locale),
      matchedAlias: candidate.alias,
      matchedLocale: candidate.locale,
      score: candidate.score,
    };
  }
}

function cloneEntry(source: DomainLexiconEntry): DomainLexiconEntry {
  const id = normalizeText(source.id);
  if (!id) throw new Error("Domain lexicon id is required");
  if (!(DOMAIN_LEXICON_DOMAINS as readonly string[]).includes(source.domain)) {
    throw new Error(`Invalid domain lexicon domain: ${String(source.domain)}`);
  }

  const sourceTag = normalizeText(source.source);
  if (!isDomainLexiconSource(sourceTag)) {
    throw new Error(`Invalid domain lexicon source: ${id}`);
  }

  const version = normalizeText(source.version);
  if (!version) throw new Error(`Domain lexicon version is required: ${id}`);

  const defaultLabel = normalizeText(source.labels?.default);
  if (!defaultLabel)
    throw new Error(`Domain lexicon default label is required: ${id}`);

  const defaultAliases = normalizeStringList(source.aliases?.default);
  if (defaultAliases.length === 0) {
    throw new Error(`Domain lexicon default aliases are required: ${id}`);
  }

  const entry: DomainLexiconEntry = {
    id,
    domain: source.domain,
    source: sourceTag,
    version,
    labels: {
      default: defaultLabel,
      locales: cloneLocalizedTextLocales(source.labels.locales),
    },
    aliases: {
      default: defaultAliases,
      locales: cloneLocalizedListLocales(source.aliases.locales),
    },
    searchBoost: cloneSearchBoost(source.searchBoost),
    deprecated: source.deprecated,
    replacedBy: source.replacedBy
      ? normalizeText(source.replacedBy)
      : undefined,
    metadata: source.metadata ? cloneMetadata(source.metadata) : undefined,
  };

  return deepFreeze(entry);
}

function cloneLocalizedTextLocales(
  locales?: Partial<Record<AppLocale, string>>,
): Partial<Record<AppLocale, string>> | undefined {
  if (!locales) return undefined;
  const result: Partial<Record<AppLocale, string>> = {};
  for (const locale of APP_LOCALES) {
    const value = normalizeText(locales[locale]);
    if (value) result[locale] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function cloneLocalizedListLocales(
  locales?: Partial<Record<AppLocale, string[]>>,
): Partial<Record<AppLocale, string[]>> | undefined {
  if (!locales) return undefined;
  const result: Partial<Record<AppLocale, string[]>> = {};
  for (const locale of APP_LOCALES) {
    const values = normalizeStringList(locales[locale]);
    if (values.length > 0) result[locale] = values;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function cloneSearchBoost(
  boost?: Partial<Record<AppLocale, number>>,
): Partial<Record<AppLocale, number>> | undefined {
  if (!boost) return undefined;
  const result: Partial<Record<AppLocale, number>> = {};
  for (const locale of APP_LOCALES) {
    const value = boost[locale];
    if (typeof value === "number" && Number.isFinite(value))
      result[locale] = value;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function cloneMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  assertJsonValue(metadata, new Set<object>());
  return structuredClone(metadata);
}

function assertJsonValue(value: unknown, ancestors: Set<object>): void {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error("Domain lexicon metadata numbers must be finite");
  }
  if (typeof value !== "object") {
    throw new Error("Domain lexicon metadata must be JSON-serializable");
  }

  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    throw new Error("Domain lexicon metadata must not contain cycles");
  }
  const prototype = Object.getPrototypeOf(objectValue);
  if (
    !Array.isArray(value) &&
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    throw new Error("Domain lexicon metadata must use plain JSON objects");
  }

  ancestors.add(objectValue);
  for (const nested of Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>)) {
    assertJsonValue(nested, ancestors);
  }
  ancestors.delete(objectValue);
}

function appendCandidate(
  index: Map<string, AliasCandidate[]>,
  key: string,
  candidate: AliasCandidate,
): void {
  const current = index.get(key);
  if (current) {
    current.push(candidate);
  } else {
    index.set(key, [candidate]);
  }
}

function scoreCandidate(
  candidate: AliasCandidate,
  query: string,
  locale: AppLocale,
  matchType: "exact" | "prefix" | "contains",
): number {
  const matchScore =
    matchType === "exact"
      ? candidate.alias === query
        ? 1000
        : 900
      : matchType === "prefix"
        ? 600
        : 400;
  const localeScore =
    candidate.locale === locale ? 120 : candidate.locale ? 0 : 40;
  const sourceScore =
    candidate.source === "id" ? 30 : candidate.source === "label" ? 20 : 10;
  const configuredBoost = candidate.entry.searchBoost?.[locale] ?? 0;
  const deprecatedPenalty = candidate.entry.deprecated ? 500 : 0;
  return (
    matchScore + localeScore + sourceScore + configuredBoost - deprecatedPenalty
  );
}

function compareRankedCandidates(
  left: RankedCandidate,
  right: RankedCandidate,
): number {
  if (left.score !== right.score) return right.score - left.score;
  const idOrder = left.entry.id.localeCompare(right.entry.id);
  if (idOrder !== 0) return idOrder;
  return left.alias.localeCompare(right.alias);
}
export function isDomainLexiconSource(
  source: string,
): source is DomainLexiconSource {
  if (source === "builtin") return true;
  return (
    (source.startsWith("catalog:") || source.startsWith("plugin:")) &&
    source.slice(source.indexOf(":") + 1).trim().length > 0
  );
}

function normalizeLimit(limit?: number): number {
  if (limit === undefined) return 20;
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(0, Math.floor(limit)));
}

function normalizeStringList(values: readonly unknown[] | undefined): string[] {
  if (!Array.isArray(values)) return [];
  return uniqueStrings(
    values.map((value) => normalizeText(value)).filter(Boolean),
  );
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function foldText(value: string): string {
  return value.toLowerCase();
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const nested of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nested);
  }
  return Object.freeze(value);
}
