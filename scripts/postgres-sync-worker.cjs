const { parentPort, workerData } = require('node:worker_threads');
const { Client } = require('pg');

const response = new Int32Array(workerData.responseBuffer, 0, 2);
const bytes = new Uint8Array(workerData.responseBuffer, 8);
const client = new Client({ connectionString: workerData.connectionString });
let connecting;

async function query(text, values) {
  if (!connecting) connecting = client.connect();
  await connecting;
  return client.query(text, values);
}

parentPort.on('message', async ({ text, values }) => {
  let payload;
  try {
    const result = await query(text, values);
    payload = { ok: true, rows: result.rows, rowCount: result.rowCount };
  } catch (error) {
    payload = { ok: false, error: { message: error.message, code: error.code, detail: error.detail } };
  }
  const encoded = Buffer.from(JSON.stringify(payload));
  if (encoded.length > bytes.length) throw new Error('PostgreSQL response is too large for the synchronous adapter');
  bytes.fill(0); bytes.set(encoded);
  Atomics.store(response, 1, encoded.length);
  Atomics.store(response, 0, 1);
  Atomics.notify(response, 0);
});
