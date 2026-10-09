'use strict';
const $ = (id) => document.getElementById(id);
let generation = 0;
let copying = false;
const maximumBytes = 20 * 1024 * 1024;
function status(message = '', error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}
function reset() {
  generation++;
  $('file').value = '';
  $('uri').value = '';
  $('content').value = '';
  $('secret').value = '';
  $('secret').type = 'password';
  $('reveal').textContent = '显示';
  $('reveal').setAttribute('aria-pressed', 'false');
  $('account').textContent = '';
  $('issuer').textContent = '';
  $('kind').textContent = '';
  $('empty').hidden = false;
  $('result').hidden = true;
  $('otp').hidden = true;
  $('generic').hidden = true;
  $('dropzone').classList.remove('dragover');
  status();
}
function render(text) {
  if (/^otpauth:/i.test(text)) {
    let uri;
    try { uri = new URL(text); } catch { throw new Error('验证器链接格式不正确。'); }
    if (!['totp', 'hotp'].includes(uri.hostname.toLowerCase())) throw new Error('暂不支持这种验证器链接。');
    const keys = uri.searchParams.getAll('secret');
    const secret = (keys[0] || '').replace(/\s/g, '').toUpperCase();
    if (keys.length !== 1 || !/^[A-Z2-7]+={0,6}$/.test(secret)) throw new Error('链接中缺少有效的 Base32 密钥。');
    let label;
    try { label = decodeURIComponent(uri.pathname.slice(1)); } catch { throw new Error('账号名称编码不正确。'); }
    const colon = label.indexOf(':');
    $('issuer').textContent = uri.searchParams.get('issuer') || (colon >= 0 ? label.slice(0, colon) : '') || '未提供';
    $('account').textContent = (colon >= 0 ? label.slice(colon + 1) : label) || '未提供';
    $('secret').value = secret;
    $('kind').textContent = uri.hostname.toUpperCase() + ' · 验证器二维码';
    $('otp').hidden = false;
  } else {
    $('content').value = text;
    $('kind').textContent = '普通二维码';
    $('generic').hidden = false;
  }
  $('empty').hidden = true;
  $('result').hidden = false;
  status('识别完成。内容仅在当前页面临时显示。');
}
async function read(file) {
  reset();
  const current = generation;
  if (!file || !/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp)$/.test(file.type)) return status('请选择 PNG、JPG、WebP、GIF 或 BMP 图片。', true);
  if (file.size > maximumBytes) return status('图片超过 20 MB，请先裁剪或压缩。', true);
  status('正在识别…');
  const url = URL.createObjectURL(file);
  const img = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('无法读取这张图片，请换一张试试。'));
      img.src = url;
    });
    if (current !== generation) return;
    if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，请先裁剪二维码区域。');
    const scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let result;
    try { result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' }); }
    finally { pixels.data.fill(0); }
    if (!result) throw new Error('没有找到二维码。请裁剪二维码区域，保留四周白边后重试。');
    render(result.data);
  } catch (error) {
    if (current === generation) status(error.message || '识别失败，请重试。', true);
  } finally {
    img.onload = img.onerror = null;
    img.src = '';
    canvas.width = canvas.height = 0;
    URL.revokeObjectURL(url);
  }
}
$('dropzone').addEventListener('click', () => $('file').click());
$('dropzone').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('file').click(); }
});
$('file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) void read(file);
});
for (const name of ['dragenter', 'dragover']) $('dropzone').addEventListener(name, (event) => {
  event.preventDefault(); $('dropzone').classList.add('dragover');
});
$('dropzone').addEventListener('dragleave', () => $('dropzone').classList.remove('dragover'));
$('dropzone').addEventListener('drop', (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) void read(file);
  else { $('dropzone').classList.remove('dragover'); status('请拖入一张图片文件。', true); }
});
// Prevent dropped files from navigating away from the tool.
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
window.addEventListener('paste', (event) => {
  const item = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'));
  if (item) { event.preventDefault(); void read(item.getAsFile()); }
});
$('parse').addEventListener('click', () => {
  const text = $('uri').value.trim();
  reset();
  if (!text) return status('请先粘贴二维码文本。', true);
  if (text.length > 100_000) return status('文本过长，请检查输入。', true);
  try { render(text); } catch (error) { status(error.message, true); }
});
$('clear').addEventListener('click', reset);
$('reveal').addEventListener('click', () => {
  const show = $('secret').type === 'password';
  $('secret').type = show ? 'text' : 'password';
  $('reveal').textContent = show ? '隐藏' : '显示';
  $('reveal').setAttribute('aria-pressed', String(show));
});
async function copy(id) {
  if (copying) return;
  const value = $(id).value;
  if (!value) return;
  const current = generation;
  copying = true;
  try {
    await navigator.clipboard.writeText(value);
    if (current === generation) status('已复制。使用后可清除系统剪贴板。');
  } catch {
    if (current === generation) status('浏览器未允许复制，请显示并手动复制内容。', true);
  } finally { copying = false; }
}
$('copy-secret').addEventListener('click', () => void copy('secret'));
$('copy-content').addEventListener('click', () => void copy('content'));
window.addEventListener('pagehide', reset);
window.addEventListener('pageshow', (event) => { if (event.persisted) reset(); });
reset();
