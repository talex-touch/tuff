import { chunkIndexedWriteRecords } from "./indexing-write-plan";

export interface IndexedWriteUpdateExecutorQueueOptions {
  estimatedTaskTimeMs: number;
  label: string;
}

export interface IndexedWriteUpdateExecutorDeps<TUpdate, TUpdated> {
  waitBeforeChunk: () => Promise<void>;
  updateOne: (record: TUpdate) => Promise<void>;
  refreshUpdated: (records: TUpdate[]) => Promise<TUpdated[]>;
  dispatchUpdated: (records: TUpdated[]) => void;
  runQueue: (
    chunks: TUpdate[][],
    handler: (chunk: TUpdate[]) => Promise<void>,
    options: IndexedWriteUpdateExecutorQueueOptions,
  ) => Promise<void>;
  now: () => number;
  formatDuration: (durationMs: number) => string;
  logDebug: (message: string, meta?: Record<string, unknown>) => void;
  logInterval?: number;
  estimatedTaskTimeMs?: number;
  label?: string;
}

export interface IndexedWriteUpdateExecutorOptions {
  dispatchSideEffects?: boolean;
}

export class IndexedWriteUpdateExecutorService<TUpdate, TUpdated> {
  private readonly waitBeforeChunk: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["waitBeforeChunk"];
  private readonly updateOne: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["updateOne"];
  private readonly refreshUpdated: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["refreshUpdated"];
  private readonly dispatchUpdated: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["dispatchUpdated"];
  private readonly runQueue: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["runQueue"];
  private readonly now: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["now"];
  private readonly formatDuration: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["formatDuration"];
  private readonly logDebug: IndexedWriteUpdateExecutorDeps<
    TUpdate,
    TUpdated
  >["logDebug"];
  private readonly logInterval: number;
  private readonly estimatedTaskTimeMs: number;
  private readonly label: string;

  constructor(deps: IndexedWriteUpdateExecutorDeps<TUpdate, TUpdated>) {
    this.waitBeforeChunk = deps.waitBeforeChunk;
    this.updateOne = deps.updateOne;
    this.refreshUpdated = deps.refreshUpdated;
    this.dispatchUpdated = deps.dispatchUpdated;
    this.runQueue = deps.runQueue;
    this.now = deps.now;
    this.formatDuration = deps.formatDuration;
    this.logDebug = deps.logDebug;
    this.logInterval = deps.logInterval ?? 200;
    this.estimatedTaskTimeMs = deps.estimatedTaskTimeMs ?? 20;
    this.label = deps.label ?? "IndexedWriteUpdateExecutor";
  }

  async execute(
    records: TUpdate[],
    chunkSize = 10,
    options: IndexedWriteUpdateExecutorOptions = {},
  ): Promise<TUpdated[]> {
    if (records.length === 0) {
      return [];
    }

    const updated: TUpdated[] = [];
    const chunks = chunkIndexedWriteRecords(records, chunkSize);
    let processedCount = 0;
    const processStart = this.now();

    await this.runQueue(
      chunks,
      async (chunk) => {
        await this.waitBeforeChunk();
        const chunkStart = this.now();

        for (const record of chunk) {
          await this.updateOne(record);
        }

        const refreshed = await this.refreshUpdated(chunk);
        updated.push(...refreshed);
        if (options.dispatchSideEffects !== false)
          this.dispatchUpdated(refreshed);

        processedCount += chunk.length;
        if (
          processedCount % this.logInterval === 0 ||
          processedCount === records.length
        ) {
          const chunkDuration = this.now() - chunkStart;
          const totalDuration = this.now() - processStart;
          const averagePerRecord =
            processedCount > 0 ? totalDuration / processedCount : totalDuration;
          this.logDebug("Indexed write update chunk processed", {
            processed: processedCount,
            total: records.length,
            duration: this.formatDuration(chunkDuration),
            averageDuration: this.formatDuration(averagePerRecord),
          });
        }
      },
      {
        estimatedTaskTimeMs: this.estimatedTaskTimeMs,
        label: this.label,
      },
    );

    return updated;
  }
}
