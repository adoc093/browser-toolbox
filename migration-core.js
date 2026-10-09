// Google Authenticator's otpauth-migration protobuf wire format.
// Schema reference: https://github.com/dim13/otpauth/tree/master/migration
const fail = () => { throw new Error('迁移数据不完整或格式不正确，请重新导入原始二维码。'); };
class Reader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0; }
  varint() {
    let value = 0n;
    for (let i = 0; i < 10; i++) {
      if (this.offset >= this.bytes.length) fail();
      const byte = this.bytes[this.offset++];
      if (i === 9 && byte > 1) fail();
      value |= BigInt(byte & 127) << BigInt(i * 7);
      if (!(byte & 128)) return value;
    }
    fail();
  }
  block() {
    const size = this.varint();
    if (size > BigInt(this.bytes.length - this.offset)) fail();
    const start = this.offset;
    this.offset += Number(size);
    return this.bytes.subarray(start, this.offset);
  }
  skip(wire) {
    if (wire === 0) { this.varint(); return; }
    if (wire === 2) { this.block(); return; }
    const size = wire === 1 ? 8 : wire === 5 ? 4 : 0;
    if (!size || this.offset + size > this.bytes.length) fail();
    this.offset += size;
  }
}
function fields(bytes, specs) {
  const reader = new Reader(bytes), result = new Map();
  while (reader.offset < bytes.length) {
    const tag = reader.varint(), wire = Number(tag & 7n), field = Number(tag >> 3n);
    if (field < 1 || field > 536870911) fail();
    if (!specs[field]) { reader.skip(wire); continue; }
    if (wire !== specs[field].wire) fail();
    const value = wire === 0 ? reader.varint() : reader.block();
    if (result.has(field) && !specs[field].repeated) fail();
    if (!result.has(field)) result.set(field, []);
    result.get(field).push(value);
  }
  return result;
}
const text = bytes => {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes || new Uint8Array()); }
  catch { fail(); }
};
const single = (map, field, fallback = 0n) => map.get(field)?.[0] ?? fallback;
const int32 = value => Number(BigInt.asIntN(32, value));
export function encodeBase32(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '', buffer = 0, bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(buffer >>> bits) & 31]; }
    buffer &= (1 << bits) - 1;
  }
  if (bits) result += alphabet[(buffer << (5 - bits)) & 31];
  return result;
}
function account(bytes) {
  const f = fields(bytes, { 1: { wire: 2 }, 2: { wire: 2 }, 3: { wire: 2 }, 4: { wire: 0 }, 5: { wire: 0 }, 6: { wire: 0 }, 7: { wire: 0 } });
  const rawSecret = single(f, 1, null);
  if (!rawSecret?.length || rawSecret.length > 640) throw new Error('有账号缺少有效密钥，未导入此二维码。');
  const algorithm = { 0: 'SHA1', 1: 'SHA1', 2: 'SHA256', 3: 'SHA512', 4: 'MD5' }[String(single(f, 4))];
  const digits = { 0: 6, 1: 6, 2: 8 }[String(single(f, 5))];
  const type = { 1: 'hotp', 2: 'totp' }[String(single(f, 6))];
  if (!algorithm || !digits || !type) throw new Error('二维码中有不支持的验证器参数，未导入此二维码。');
  const counter = single(f, 7);
  if (counter > 9223372036854775807n) throw new Error('HOTP 计数器无效。');
  return { name: text(single(f, 2, null)), issuer: text(single(f, 3, null)), secret: encodeBase32(rawSecret), algorithm, digits, type, counter: counter.toString(), period: type === 'totp' ? 30 : null };
}
export function parseMigration(input) {
  let uri;
  try { uri = new URL(input.trim()); } catch { throw new Error('请导入 Google Authenticator 的迁移二维码。'); }
  if (uri.protocol !== 'otpauth-migration:' || uri.hostname !== 'offline') throw new Error('这不是 Google 验证器的批量迁移二维码。');
  if (uri.searchParams.getAll('data').length !== 1) fail();
  // URLSearchParams treats literal + as spaces. Preserve standard base64 input.
  const data = uri.searchParams.get('data').replace(/ /g, '+').replace(/-/g, '+').replace(/_/g, '/');
  if (!data || data.length > 100000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4 === 1) fail();
  let bytes;
  try { bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0)); } catch { fail(); }
  try {
    const f = fields(bytes, { 1: { wire: 2, repeated: true }, 2: { wire: 0 }, 3: { wire: 0 }, 4: { wire: 0 }, 5: { wire: 0 } });
    const version = int32(single(f, 2));
    const size = int32(single(f, 3, 1n));
    const index = int32(single(f, 4));
    const id = int32(single(f, 5));
    if (![0, 1, 2].includes(version)) throw new Error('暂不支持此迁移格式版本。');
    if (size < 1 || size > 1000 || index < 0 || index >= size) throw new Error('二维码的批次编号不正确。');
    const entries = (f.get(1) || []).map(account);
    if (!entries.length || entries.length > 1000) throw new Error('二维码中没有可导出的账号，或账号数量超出上限。');
    return { version, size, index, id, entries };
  } finally { bytes.fill(0); }
}
export class MigrationBatch {
  constructor() { this.parts = new Map(); this.identity = null; }
  add(part) {
    const identity = `${part.version}:${part.size}:${part.id}`;
    if (this.identity && identity !== this.identity) throw new Error('混入了另一批导出二维码。请清空后只导入同一次导出的图片。');
    const existing = this.parts.get(part.index);
    if (existing) {
      if (JSON.stringify(existing.entries) !== JSON.stringify(part.entries)) throw new Error(`第 ${part.index + 1} 张与已导入内容冲突，请检查是否混入另一批二维码。`);
      return false;
    }
    this.identity = identity;
    this.parts.set(part.index, part);
    return true;
  }
  get size() { return this.parts.values().next().value?.size || 0; }
  get missing() { return Array.from({ length: this.size }, (_, i) => i).filter(i => !this.parts.has(i)).map(i => i + 1); }
  get complete() { return this.size > 0 && this.missing.length === 0; }
  get entries() { return [...this.parts.values()].sort((a, b) => a.index - b.index).flatMap(p => p.entries); }
  clear() { this.parts.clear(); this.identity = null; }
}
export function otpauthLink(entry) {
  const label = entry.name || entry.issuer || 'Account';
  const uri = new URL(`otpauth://${entry.type}/${encodeURIComponent(label)}`);
  uri.searchParams.set('secret', entry.secret);
  if (entry.issuer) uri.searchParams.set('issuer', entry.issuer);
  uri.searchParams.set('algorithm', entry.algorithm);
  uri.searchParams.set('digits', String(entry.digits));
  uri.searchParams.set(entry.type === 'hotp' ? 'counter' : 'period', entry.type === 'hotp' ? entry.counter : String(entry.period));
  return uri.toString();
}
export function exportBatch(batch, format) {
  if (!batch.complete) throw new Error('批次还没收齐，补齐全部二维码后才能导出。');
  if (!['txt', 'md'].includes(format)) throw new Error('请选择 TXT 或 Markdown 格式。');
  const entries = batch.entries;
  const escape = value => String(value).replace(/[\x00-\x1f\x7f]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const metadata = [`账号数：${entries.length}`, `二维码：${batch.parts.size}/${batch.size}（完整）`, '包含账号密钥，请存放在加密位置。', 'TOTP 周期：30 秒（Google 迁移格式不包含自定义周期）。'];
  const lines = format === 'md' ? ['# Google 验证器账号备份', '', ...metadata.map(s => `> ${s}`), ''] : ['Google 验证器账号备份', '', ...metadata, ''];
  entries.forEach((entry, i) => {
    const rows = [
      `名称：${escape(entry.name || '未提供')}`, `服务：${escape(entry.issuer || '未提供')}`,
      `密钥：${entry.secret}`, `类型：${entry.type.toUpperCase()}`, `算法：${entry.algorithm}`, `位数：${entry.digits}`,
      entry.type === 'hotp' ? `计数器：${entry.counter}` : `周期：${entry.period} 秒`, `恢复链接：${otpauthLink(entry)}`
    ];
    if (format === 'md') {
      const longestFence = Math.max(2, ...rows.flatMap(r => (r.match(/`+/g) || []).map(s => s.length)));
      const fence = '`'.repeat(longestFence + 1);
      lines.push(`## ${i + 1}. 账号`, '', fence + 'text', ...rows, fence, '');
    } else lines.push(`【${i + 1}】`, ...rows, '', '----------------------------------------', '');
  });
  return lines.join('\n');
}
