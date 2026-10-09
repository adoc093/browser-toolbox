import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeBase32, parseTotpInput, createTotpKey, generateTotp } from '../totp-core.js';

// Public reference vectors: https://www.rfc-editor.org/rfc/rfc6238#appendix-B
const times = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
const vectors = {
  'SHA-1': ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'],
  'SHA-256': ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'],
  'SHA-512': ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826']
};
function encode(bytes) {
  const bits = [...bytes].map(b => b.toString(2).padStart(8, '0')).join('');
  return (bits.match(/.{1,5}/g) || []).map(chunk => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(chunk.padEnd(5, '0'), 2)]).join('');
}
for (const [algorithm, expected] of Object.entries(vectors)) {
  for (let i = 0; i < times.length; i++) test(`RFC 6238 ${algorithm} at ${times[i]}`, async () => {
    const length = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-512': 64 }[algorithm];
    const secret = encode(new TextEncoder().encode('1234567890'.repeat(7).slice(0, length)));
    const key = await createTotpKey(secret, algorithm);
    assert.equal(key.extractable, false);
    assert.equal(await generateTotp(key, { digits: 8, period: 30 }, times[i]), expected[i]);
    assert.equal(await generateTotp(key, { digits: 6, period: 30 }, times[i]), expected[i].slice(-6));
  });
}
test('Base32 whitespace, lower case, padding and round trip', () => {
  assert.equal(new TextDecoder().decode(decodeBase32(' my====== ')), 'f');
  assert.equal(new TextDecoder().decode(decodeBase32('MZXW6===')), 'foo');
  for (let size = 1; size <= 80; size++) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 17 + size) % 256);
    assert.deepEqual(decodeBase32(encode(bytes)), bytes);
  }
  for (const invalid of ['', 'A', 'AB', 'MZX', 'MZ======', 'MY=', 'A!23', '123456']) assert.throws(() => decodeBase32(invalid));
});
test('URI parameters override form defaults and reject unsupported options', () => {
  const result = parseTotpInput('otpauth://totp/Demo?secret=MY======&digits=8&period=60&algorithm=SHA256', { period: 20, digits: 6, algorithm: 'SHA-1' });
  assert.deepEqual(result, { secret: 'MY======', digits: 8, period: 60, algorithm: 'SHA-256' });
  assert.equal(parseTotpInput('otpauth://totp/Demo?secret=MY======', { period: 60 }).period, 30);
  for (const suffix of ['&digits=7', '&period=0', '&period=30.5', '&algorithm=MD5', '&secret=MY======']) assert.throws(() => parseTotpInput('otpauth://totp/Demo?secret=MY======' + suffix));
  assert.throws(() => parseTotpInput('otpauth://hotp/Demo?secret=MY======'));
  assert.throws(() => parseTotpInput('MY======', { period: '' }));
});
