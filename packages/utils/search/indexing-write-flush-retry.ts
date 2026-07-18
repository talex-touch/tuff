export interface IndexedWriteFlushDelayOptions {
  baseDelayMs?: number;
  backlogDelayMs?: number;
  backlogThreshold?: number;
}

export interface IndexedWriteFlushBackoffOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
}

export interface IndexedWriteFlushRetryConfig {
  baseDelayMs?: number;
  backlogDelayMs?: number;
  backlogThreshold?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  random?: () => number;
}

export interface IndexedWriteFlushFailureDecision<
  TReason extends string = string,
> {
  retryable: boolean;
  delayMs: number;
  nextRetryCount: number;
  reason: TReason;
}

export type IndexedWriteFlushFailureClassifier<
  TClassification extends string = string,
> = (error: unknown) => TClassification | null;

export interface IndexedWriteFlushClassifiedFailureDecision<
  TReason extends string = string,
  TClassification extends string = string,
> extends IndexedWriteFlushFailureDecision<TReason> {
  classification: TClassification | null;
}

export interface IndexedWriteFlushClassifiedFailureInput<
  TReason extends string = string,
  TClassification extends string = string,
> {
  error: unknown;
  pendingSize: number;
  retryCount: number;
  classify: IndexedWriteFlushFailureClassifier<TClassification>;
  retryableClassifications: readonly TClassification[];
  retryableReason: TReason;
  fallbackReason: TReason;
}

export function getIndexedWriteFlushDelay(
  pendingSize: number,
  options: IndexedWriteFlushDelayOptions = {},
): number {
  const baseDelayMs = options.baseDelayMs ?? 250;
  const backlogDelayMs = options.backlogDelayMs ?? 500;
  const backlogThreshold = options.backlogThreshold ?? 30;
  return pendingSize > backlogThreshold ? backlogDelayMs : baseDelayMs;
}

export function getIndexedWriteFlushExponentialRetryDelay(
  retryCount: number,
  options: IndexedWriteFlushBackoffOptions = {},
): { delayMs: number; nextRetryCount: number } {
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const random = options.random ?? Math.random;

  const exponent = Math.min(Math.max(0, retryCount), 6);
  const base = Math.min(maxDelayMs, baseDelayMs * 2 ** exponent);
  const jitterRange = Math.max(1, Math.round(base * 0.2));
  const jitter = Math.round((random() * 2 - 1) * jitterRange);

  return {
    delayMs: Math.max(baseDelayMs, base + jitter),
    nextRetryCount: retryCount + 1,
  };
}

export class IndexedWriteFlushRetryService {
  private readonly config: Required<
    Omit<IndexedWriteFlushRetryConfig, "random">
  > & {
    random: () => number;
  };

  constructor(config: IndexedWriteFlushRetryConfig = {}) {
    this.config = {
      baseDelayMs: config.baseDelayMs ?? 250,
      backlogDelayMs: config.backlogDelayMs ?? 500,
      backlogThreshold: config.backlogThreshold ?? 30,
      retryBaseMs: config.retryBaseMs ?? 250,
      retryMaxMs: config.retryMaxMs ?? 5000,
      random: config.random ?? Math.random,
    };
  }

  getFlushDelay(pendingSize: number): number {
    return getIndexedWriteFlushDelay(pendingSize, {
      baseDelayMs: this.config.baseDelayMs,
      backlogDelayMs: this.config.backlogDelayMs,
      backlogThreshold: this.config.backlogThreshold,
    });
  }

  resolveFailure<TReason extends string>(input: {
    pendingSize: number;
    retryCount: number;
    retryable: boolean;
    retryableReason: TReason;
    fallbackReason: TReason;
  }): IndexedWriteFlushFailureDecision<TReason> {
    if (input.retryable) {
      const retry = getIndexedWriteFlushExponentialRetryDelay(
        input.retryCount,
        {
          baseDelayMs: this.config.retryBaseMs,
          maxDelayMs: this.config.retryMaxMs,
          random: this.config.random,
        },
      );
      return {
        retryable: true,
        delayMs: retry.delayMs,
        nextRetryCount: retry.nextRetryCount,
        reason: input.retryableReason,
      };
    }

    return {
      retryable: false,
      delayMs: this.getFlushDelay(input.pendingSize),
      nextRetryCount: input.retryCount,
      reason: input.fallbackReason,
    };
  }

  resolveClassifiedFailure<
    TReason extends string,
    TClassification extends string,
  >(
    input: IndexedWriteFlushClassifiedFailureInput<TReason, TClassification>,
  ): IndexedWriteFlushClassifiedFailureDecision<TReason, TClassification> {
    const classification = input.classify(input.error);
    const decision = this.resolveFailure({
      pendingSize: input.pendingSize,
      retryCount: input.retryCount,
      retryable: Boolean(
        classification &&
        input.retryableClassifications.includes(classification),
      ),
      retryableReason: input.retryableReason,
      fallbackReason: input.fallbackReason,
    });

    return {
      ...decision,
      classification,
    };
  }
}
