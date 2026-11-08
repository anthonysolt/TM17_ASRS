const { parentPort, workerData } = require('node:worker_threads');
const { Client } = require('pg');

const response = new Int32Array(workerData.responseBuffer, 0, 2);
const bytes = new Uint8Array(workerData.responseBuffer, 8);
let client = null;
let connecting = null;

// Transaction state. If the connection drops while a transaction is open, the
// statements before the drop are rolled back by PostgreSQL; running the rest on
// a fresh connection would autocommit them and leave a partial write. So the
// transaction is marked broken and every statement fails until ROLLBACK/COMMIT.
let inTransaction = false;
let transactionBroken = false;

// Drop a broken connection so the next query opens a fresh one, instead of
// every later query failing until the server is restarted.
function resetConnection(failedClient, reason) {
  if (client !== failedClient) return;
  console.error('[postgres-sync-worker] connection reset:', reason?.message || reason || 'connection ended');
  if (inTransaction) transactionBroken = true;
  client = null;
  connecting = null;
  failedClient.end().catch((err) => console.error('[postgres-sync-worker] error closing failed connection:', err?.message || err));
}

function statementKind(text) {
  const match = /^\s*(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK)\b/i.exec(text);
  if (!match) return null;
  const word = match[1].toUpperCase();
  if (word === 'BEGIN' || word.startsWith('START')) return 'begin';
  if (word === 'ROLLBACK') return 'rollback';
  return 'commit';
}

function transactionAbortedError() {
  const error = new Error('The database connection was lost during a transaction; the transaction was rolled back.');
  error.code = 'TRANSACTION_ABORTED';
  return error;
}

async function query(text, values) {
  const kind = statementKind(text);

  if (transactionBroken) {
    // Only ROLLBACK may proceed (as a no-op); COMMIT and other statements must fail.
    if (kind === 'rollback') {
      inTransaction = false;
      transactionBroken = false;
      return { rows: [], rowCount: 0 };
    }
    if (kind === 'commit') {
      inTransaction = false;
      transactionBroken = false;
    }
    throw transactionAbortedError();
  }

  if (!client) {
    const nextClient = new Client({ connectionString: workerData.connectionString });
    nextClient.on('error', (error) => resetConnection(nextClient, error));
    nextClient.on('end', () => resetConnection(nextClient));
    client = nextClient;
    connecting = nextClient.connect().catch((error) => {
      resetConnection(nextClient, error);
      throw error;
    });
  }
  const activeClient = client;
  await connecting;
  const result = await activeClient.query(text, values);

  if (kind === 'begin') inTransaction = true;
  if (kind === 'commit' || kind === 'rollback') inTransaction = false;
  return result;
}

function encodeError(message, code, detail) {
  return Buffer.from(JSON.stringify({ ok: false, error: { message, code, detail } }));
}

// Always answer: the main thread blocks until response[0] is set, so this
// handler must never throw before writing a payload.
parentPort.on('message', async ({ text, values }) => {
  let encoded;
  try {
    const result = await query(text, values);
    encoded = Buffer.from(JSON.stringify({ ok: true, rows: result.rows, rowCount: result.rowCount }));
  } catch (error) {
    try {
      encoded = encodeError(error.message, error.code, error.detail);
    } catch {
      encoded = encodeError(String(error?.message ?? error ?? 'Database query failed'), error?.code);
    }
  }

  if (encoded.length > bytes.length) {
    encoded = encodeError(
      `PostgreSQL response is too large for the synchronous adapter (${encoded.length} bytes; limit ${bytes.length}).`,
      'RESPONSE_TOO_LARGE'
    );
  }

  // The reader only decodes the first encoded.length bytes (passed in response[1]),
  // so the rest of the buffer never needs clearing.
  bytes.set(encoded);
  Atomics.store(response, 1, encoded.length);
  Atomics.store(response, 0, 1);
  Atomics.notify(response, 0);
});
