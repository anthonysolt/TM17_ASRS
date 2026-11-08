// Stub for PostgresSyncDatabase tests: speaks the same shared-buffer protocol as
// scripts/postgres-sync-worker.cjs without a database.
//   text containing HANG  -> never replies
//   text containing CRASH -> the worker exits
//   text containing FAIL  -> error payload with code TEST_FAIL
//   anything else         -> { rows: [{ text, values }] }
const { parentPort, workerData } = require('node:worker_threads');

const response = new Int32Array(workerData.responseBuffer, 0, 2);
const bytes = new Uint8Array(workerData.responseBuffer, 8);

parentPort.on('message', ({ text, values }) => {
  if (text.includes('HANG')) return;
  if (text.includes('CRASH')) process.exit(1);
  const payload = text.includes('FAIL')
    ? { ok: false, error: { message: 'stub failure', code: 'TEST_FAIL' } }
    : { ok: true, rows: [{ text, values }], rowCount: 1 };
  const encoded = Buffer.from(JSON.stringify(payload));
  bytes.set(encoded);
  Atomics.store(response, 1, encoded.length);
  Atomics.store(response, 0, 1);
  Atomics.notify(response, 0);
});
