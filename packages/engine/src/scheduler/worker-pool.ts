import { cancelledError, type EngineError } from '../types.js';

export interface WorkerMessageEvent {
  readonly data: unknown;
}

export interface WorkerErrorEvent {
  readonly message: string;
}

export interface WorkerHandle {
  postMessage(message: unknown, transfer: Transferable[]): void;
  terminate(): void;
  addEventListener(type: 'message', listener: (event: WorkerMessageEvent) => void): void;
  addEventListener(type: 'error', listener: (event: WorkerErrorEvent) => void): void;
}

export type WorkerFactory = () => WorkerHandle;

interface WorkerReply {
  readonly jobId: number;
  readonly ok: boolean;
  readonly value?: unknown;
  readonly error?: string;
}

interface PendingJob<T> {
  readonly id: number;
  readonly module: string;
  readonly payload: unknown;
  readonly transfer: Transferable[];
  readonly signal?: AbortSignal;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: EngineError) => void;
  abortListener?: () => void;
}

interface Slot {
  readonly worker: WorkerHandle;
  module?: string;
  job: PendingJob<unknown> | undefined;
}

export function workerPoolSize(hardwareConcurrency: number | undefined): number {
  const available = Number.isFinite(hardwareConcurrency) ? hardwareConcurrency! : 2;
  return Math.min(16, Math.max(1, Math.floor(available) - 1));
}

export function moduleWorkerFactory(url: URL): WorkerFactory {
  return () => new Worker(url, { type: 'module' });
}

export class WorkerPool {
  readonly size: number;
  readonly #factory: WorkerFactory;
  readonly #slots: Slot[] = [];
  readonly #queue: PendingJob<unknown>[] = [];
  #nextJobId = 1;

  constructor(
    factory: WorkerFactory,
    hardwareConcurrency = globalThis.navigator?.hardwareConcurrency,
  ) {
    this.#factory = factory;
    this.size = workerPoolSize(hardwareConcurrency);
  }

  get pressure(): number {
    const load = this.#queue.length + this.#slots.filter((slot) => slot.job !== undefined).length;
    return Math.min(1, load / this.size);
  }

  run<T>(
    module: string,
    payload: unknown,
    options: { signal?: AbortSignal; transfer?: Transferable[] } = {},
  ): Promise<T> {
    if (options.signal?.aborted) return Promise.reject(cancelledError());

    return new Promise<T>((resolve, reject) => {
      const job: PendingJob<T> = {
        id: this.#nextJobId++,
        module,
        payload,
        transfer: options.transfer ?? [],
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        resolve,
        reject,
      };
      job.abortListener = () => this.#abort(job as PendingJob<unknown>);
      job.signal?.addEventListener('abort', job.abortListener, { once: true });
      this.#queue.push(job as PendingJob<unknown>);
      this.#dispatch();
    });
  }

  dispose(): void {
    for (const job of this.#queue.splice(0)) this.#reject(job, cancelledError());
    for (const slot of this.#slots.splice(0)) {
      slot.worker.terminate();
      if (slot.job) this.#reject(slot.job, cancelledError());
    }
  }

  #createSlot(): Slot {
    const slot: Slot = { worker: this.#factory(), job: undefined };
    slot.worker.addEventListener('message', (event) => this.#onMessage(slot, event));
    slot.worker.addEventListener('error', (event) => this.#onWorkerError(slot, event.message));
    this.#slots.push(slot);
    return slot;
  }

  #dispatch(): void {
    while (this.#queue.length > 0) {
      const next = this.#queue[0]!;
      let slot = this.#slots.find(
        (candidate) => !candidate.job && candidate.module === next.module,
      );
      slot ??= this.#slots.find((candidate) => !candidate.job);
      if (!slot && this.#slots.length < this.size) slot = this.#createSlot();
      if (!slot) return;

      this.#queue.shift();
      if (next.signal?.aborted) {
        this.#reject(next, cancelledError());
        continue;
      }
      slot.job = next;
      slot.module = next.module;
      slot.worker.postMessage(
        { type: 'run', jobId: next.id, module: next.module, payload: next.payload },
        next.transfer,
      );
      // The transfer list must not be retained after ownership moves to the worker.
      next.transfer.length = 0;
    }
  }

  #onMessage(slot: Slot, event: WorkerMessageEvent): void {
    const reply = event.data as Partial<WorkerReply>;
    const job = slot.job;
    if (!job || reply.jobId !== job.id) return;
    slot.job = undefined;
    this.#removeAbortListener(job);
    if (reply.ok) job.resolve(reply.value);
    else
      job.reject({
        kind: 'internal',
        detail: reply.error ?? 'Worker job failed without a reason.',
        remedy: 'Retry the operation. If it fails again, report the diagnostic details.',
      });
    this.#dispatch();
  }

  #onWorkerError(slot: Slot, message: string): void {
    const job = slot.job;
    this.#replaceSlot(slot);
    if (job)
      this.#reject(job, {
        kind: 'internal',
        detail: message,
        remedy: 'Retry the operation. If it fails again, report the diagnostic details.',
      });
    this.#dispatch();
  }

  #abort(job: PendingJob<unknown>): void {
    const queueIndex = this.#queue.indexOf(job);
    if (queueIndex >= 0) {
      this.#queue.splice(queueIndex, 1);
      this.#reject(job, cancelledError());
      return;
    }
    const slot = this.#slots.find((candidate) => candidate.job === job);
    if (!slot) return;
    // Termination is the only browser primitive that guarantees the worker's
    // in-flight buffers are released before this promise settles.
    this.#replaceSlot(slot);
    this.#reject(job, cancelledError());
    this.#dispatch();
  }

  #replaceSlot(slot: Slot): void {
    slot.worker.terminate();
    const index = this.#slots.indexOf(slot);
    if (index >= 0) this.#slots.splice(index, 1);
  }

  #reject(job: PendingJob<unknown>, error: EngineError): void {
    this.#removeAbortListener(job);
    job.reject(error);
  }

  #removeAbortListener(job: PendingJob<unknown>): void {
    if (job.abortListener) job.signal?.removeEventListener('abort', job.abortListener);
  }
}
