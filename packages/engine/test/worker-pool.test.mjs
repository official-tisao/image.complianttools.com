import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkerPool, workerPoolSize } from '../dist/index.js';

class FakeWorker {
  static nextId = 1;
  constructor(log) {
    this.id = FakeWorker.nextId++;
    this.log = log;
    this.listeners = { message: [], error: [] };
    this.terminated = false;
  }
  addEventListener(type, listener) {
    this.listeners[type].push(listener);
  }
  postMessage(message, transfer) {
    this.log.push({ worker: this.id, module: message.module });
    structuredClone(message, { transfer });
    if (message.payload?.hang) return;
    queueMicrotask(() => {
      for (const listener of this.listeners.message)
        listener({ data: { jobId: message.jobId, ok: true, value: message.payload } });
    });
  }
  terminate() {
    this.terminated = true;
  }
}

test('pool size clamps hardware concurrency minus one', () => {
  assert.equal(workerPoolSize(1), 1);
  assert.equal(workerPoolSize(8), 7);
  assert.equal(workerPoolSize(99), 16);
});

test('transfers buffers and prefers a worker with module affinity', async () => {
  const log = [];
  const pool = new WorkerPool(() => new FakeWorker(log), 3);
  const first = new ArrayBuffer(8);
  await pool.run('codec-a', { value: 1 }, { transfer: [first] });
  await pool.run('codec-b', { value: 2 });
  await pool.run('codec-a', { value: 3 });
  assert.equal(first.byteLength, 0);
  assert.equal(log[0].worker, log[2].worker);
  assert.equal(pool.pressure, 0);
  pool.dispose();
});

test('cancels an in-flight five-second job in under 50 ms and frees its worker', async () => {
  const workers = [];
  const pool = new WorkerPool(() => {
    const worker = new FakeWorker([]);
    workers.push(worker);
    return worker;
  }, 2);
  const controller = new AbortController();
  const buffer = new ArrayBuffer(32);
  const job = pool.run(
    'slow-codec',
    { hang: true },
    { signal: controller.signal, transfer: [buffer] },
  );
  const started = performance.now();
  controller.abort();
  await assert.rejects(
    job,
    (error) => error.kind === 'cancelled' && typeof error.remedy === 'string',
  );
  assert.ok(performance.now() - started < 50);
  assert.equal(buffer.byteLength, 0);
  assert.equal(workers[0].terminated, true);
  pool.dispose();
});
