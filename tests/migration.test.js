import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMigration, MigrationBatch, exportBatch, encodeBase32, otpauthLink } from '../migration-core.js';
// Synthetic protobuf encoder independent of the production reader; no real credentials.
export function varint(value) {
  let n = BigInt.asUintN(64, BigInt(value)); const bytes = [];
  do { const byte = Number(n & 127n); n >>= 7n; bytes.push(byte | (n ? 128 : 0)); } while (n);
  return Buffer.from(bytes);
}
export const number = (field, value) => Buffer.concat([varint(field << 3), varint(value)]);
export const block = (field, value) => { const bytes = Buffer.from(value); return Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes]); };
export function fixture(index = 0, size = 2, id = 42, options = {}) {
  const a = Buffer.concat([
    block(1, 'Hello!\xde\xad\xbe\xef'), block(2, options.name ?? `Demo:alice-${index}@example.com`), block(3, 'Demo'),
    number(4, options.algorithm ?? 1), number(5, options.digits ?? 1), number(6, options.type ?? 2), number(7, options.counter ?? 0)
  ]);
  const payload = Buffer.concat([block(1, a), number(2, options.version ?? 1), number(3, size), number(4, index), number(5, id)]);
  return `otpauth-migration://offline?data=${encodeURIComponent(payload.toString('base64'))}`;
}
test('independent public migration example matches known secret', () => {
  const part = parseMigration('otpauth-migration://offline?data=CjEKCkhlbGxvId6tvu8SGEV4YW1wbGU6YWxpY2VAZ29vZ2xlLmNvbRoHRXhhbXBsZTAC');
  assert.equal(part.entries[0].secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(part.entries[0].name, 'Example:alice@google.com');
  assert.equal(part.entries[0].algorithm, 'SHA1');
  assert.equal(part.size, 1);
});
test('out of order batches, duplicates and incomplete export', () => {
  const batch = new MigrationBatch();
  const last = parseMigration(fixture(2, 3));
  assert.equal(batch.add(last), true);
  assert.deepEqual(batch.missing, [1, 2]);
  assert.throws(() => exportBatch(batch, 'txt'));
  assert.equal(batch.add(last), false);
  batch.add(parseMigration(fixture(0, 3))); batch.add(parseMigration(fixture(1, 3)));
  assert.equal(batch.complete, true);
  assert.match(batch.entries[0].name, /alice-0/);
  assert.equal(batch.entries.length, 3);
  batch.clear(); assert.equal(batch.complete, false); assert.equal(batch.entries.length, 0);
});
test('mixed batches and conflicting repeated index are rejected', () => {
  const batch = new MigrationBatch(); batch.add(parseMigration(fixture()));
  assert.throws(() => batch.add(parseMigration(fixture(1, 2, 99))));
  assert.throws(() => batch.add(parseMigration(fixture(0, 2, 42, { name: 'changed' }))));
});
test('version 2 migration retains the same validated account schema', () => {
  const part = parseMigration(fixture(0, 12, 42, { version: 2 }));
  assert.equal(part.version, 2);
  assert.equal(part.size, 12);
  assert.equal(part.entries.length, 1);
  assert.equal(part.entries[0].type, 'totp');
});
test('TXT and Markdown preserve account parameters and safe formatting', () => {
  const batch = new MigrationBatch();
  const name = 'Demo:<img onerror=alert(1)>\n```\n# injected';
  batch.add(parseMigration(fixture(0, 1, -123, { type: 1, counter: 9007199254740993n, algorithm: 3, digits: 2, name })));
  const entry = batch.entries[0];
  assert.equal(entry.counter, '9007199254740993');
  const uri = new URL(otpauthLink(entry));
  assert.equal(uri.searchParams.get('counter'), entry.counter);
  assert.equal(uri.searchParams.get('algorithm'), 'SHA512');
  assert.equal(decodeURIComponent(uri.pathname.slice(1)), name);
  for (const format of ['txt', 'md']) {
    const output = exportBatch(batch, format);
    assert.match(output, /账号数：1/); assert.match(output, /HOTP/); assert.match(output, /9007199254740993/);
    assert.match(output, /恢复链接：otpauth:\/\/hotp/);
    assert(output.includes('\\u000a')); assert(!output.includes('\n# injected'));
  }
  assert(exportBatch(batch, 'md').includes('````text'));
  assert.throws(() => exportBatch(batch, 'csv'));
});
test('malformed data, truncation, invalid index, type and version are rejected', () => {
  for (const uri of ['https://example.com', 'otpauth://totp/demo', 'otpauth-migration://offline?data=A', 'otpauth-migration://offline?data=!!!!', 'otpauth-migration://offline?data=AQ==&data=AQ==', fixture(2, 2), fixture(0, 0), fixture(0, 1, 42, { type: 0 }), fixture(0, 1, 42, { algorithm: 9 })]) assert.throws(() => parseMigration(uri));
  const payload = Buffer.concat([block(1, [1]), number(2, 9)]);
  assert.throws(() => parseMigration('otpauth-migration://offline?data=' + payload.toString('base64')));
  const valid = new URL(fixture()).searchParams.get('data');
  const bytes = Buffer.from(valid, 'base64');
  assert.throws(() => parseMigration('otpauth-migration://offline?data=' + bytes.subarray(0, bytes.length - 1).toString('base64')));
});
test('base32 export round-trips arbitrary secret bytes', async () => {
  const { decodeBase32 } = await import('../totp-core.js');
  for (let n = 1; n < 80; n++) { const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + n) % 256); assert.deepEqual(decodeBase32(encodeBase32(bytes)), bytes); }
});
test('12-part batch exports every one of 112 accounts, including the final record', () => {
  const batch = new MigrationBatch();
  for (let i = 11; i >= 0; i--) {
    const part = parseMigration(fixture(i, 12));
    part.entries = Array.from({ length: i === 11 ? 2 : 10 }, (_, j) => ({ ...part.entries[0], name: `Demo:account-${i * 10 + j + 1}` }));
    batch.add(part);
  }
  assert.equal(batch.entries.length, 112);
  assert.equal(batch.entries[111].name, 'Demo:account-112');
  for (const format of ['txt', 'md']) {
    const content = exportBatch(batch, format);
    assert.match(content, /账号数：112/);
    assert.equal((content.match(/^名称：/gm) || []).length, 112);
    assert.match(content, /名称：Demo:account-112/);
  }
});
