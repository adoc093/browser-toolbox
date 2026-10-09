// RFC 6238, with native Web Crypto. No network or persistent storage.
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function decodeBase32(value) {
  const normalized = value.replace(/\s/g, '').toUpperCase();
  if (!normalized || normalized.length > 1024 || !/^[A-Z2-7]+={0,6}$/.test(normalized)) throw new Error('密钥格式不正确，请粘贴完整的 Base32 密钥。');
  const raw = normalized.replace(/=+$/, '');
  const padding = normalized.length - raw.length;
  const remainder = raw.length % 8;
  if (![0, 2, 4, 5, 7].includes(remainder) || (padding && padding !== (8 - remainder) % 8)) throw new Error('密钥长度或填充不正确，请检查是否复制完整。');
  const bytes = new Uint8Array(Math.floor(raw.length * 5 / 8));
  let buffer = 0, bits = 0, index = 0;
  for (const character of raw) {
    buffer = (buffer << 5) | alphabet.indexOf(character);
    bits += 5;
    if (bits >= 8) { bits -= 8; bytes[index++] = (buffer >>> bits) & 255; buffer &= (1 << bits) - 1; }
  }
  if (buffer !== 0 || !bytes.length) { bytes.fill(0); throw new Error('密钥末尾不完整或格式不正确。'); }
  return bytes;
}
export function parseTotpInput(input, defaults = {}) {
  let secret = input.trim();
  let algorithm = defaults.algorithm ?? 'SHA-1';
  let digits = Number(defaults.digits ?? 6);
  let period = Number(defaults.period ?? 30);
  if (/^otpauth:/i.test(secret)) {
    let uri;
    try { uri = new URL(secret); } catch { throw new Error('验证器链接格式不正确。'); }
    if (uri.hostname !== 'totp') throw new Error('这里只生成基于时间的 TOTP 验证码，请使用 TOTP 密钥或链接。');
    for (const parameter of ['secret', 'algorithm', 'digits', 'period']) {
      if (uri.searchParams.getAll(parameter).length > 1) throw new Error('链接包含重复参数，请检查。');
    }
    secret = uri.searchParams.get('secret') || '';
    const hash = (uri.searchParams.get('algorithm') || 'SHA1').toUpperCase();
    algorithm = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512', 'SHA-1': 'SHA-1', 'SHA-256': 'SHA-256', 'SHA-512': 'SHA-512' }[hash];
    digits = Number(uri.searchParams.get('digits') ?? 6);
    period = Number(uri.searchParams.get('period') ?? 30);
  }
  if (!['SHA-1', 'SHA-256', 'SHA-512'].includes(algorithm)) throw new Error('算法仅支持 SHA-1、SHA-256 或 SHA-512。');
  if (![6, 8].includes(digits)) throw new Error('验证码位数仅支持 6 位或 8 位。');
  if (!Number.isInteger(period) || period < 5 || period > 300) throw new Error('更新周期须为 5–300 秒的整数。');
  const bytes = decodeBase32(secret);
  bytes.fill(0);
  return { secret, algorithm, digits, period };
}
export async function createTotpKey(secret, algorithm) {
  if (!globalThis.crypto?.subtle) throw new Error('当前浏览器不支持安全计算，请使用 HTTPS 页面和新版浏览器。');
  const bytes = decodeBase32(secret);
  try { return await crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: algorithm }, false, ['sign']); }
  finally { bytes.fill(0); }
}
export async function generateTotp(key, { digits = 6, period = 30 } = {}, seconds = Date.now() / 1000) {
  if (!Number.isFinite(seconds) || seconds < 0 || !Number.isInteger(period) || period < 5 || period > 300 || ![6, 8].includes(digits)) throw new Error('验证码参数不正确。');
  const counter = Math.floor(seconds / period);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  digest.fill(0);
  return String(binary % (10 ** digits)).padStart(digits, '0');
}
