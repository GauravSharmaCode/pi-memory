import { describe, it, after } from 'node:test';
import * as assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Set up a temporary workspace
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-test-'));
process.env.MEMORY_WORKSPACE = tmpDir;

// Import after environment variables are set
import { dbTransaction, dbRun, dbAll, closeDb } from './db.js';

describe('dbTransaction', () => {
  after(() => {
    closeDb();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('commits successfully', () => {
    dbRun('DELETE FROM meta');

    dbTransaction(() => {
      dbRun('INSERT INTO meta (key, value) VALUES (?, ?)', ['test_key', 'test_value']);
    });

    const rows = dbAll<{key: string, value: string}>('SELECT * FROM meta WHERE key = ?', ['test_key']);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].value, 'test_value');
  });

  it('rolls back on error', () => {
    dbRun('DELETE FROM meta');

    assert.throws(() => {
      dbTransaction(() => {
        dbRun('INSERT INTO meta (key, value) VALUES (?, ?)', ['error_key', 'error_value']);
        throw new Error('Test error');
      });
    }, /Test error/);

    const rows = dbAll('SELECT * FROM meta WHERE key = ?', ['error_key']);
    assert.strictEqual(rows.length, 0);
  });
});
