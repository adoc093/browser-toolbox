import { parseMigration, MigrationBatch, exportBatch } from './migration-core.js';
import { decodeQrImage } from './qr-image.js';
const $ = id => document.getElementById(id);
const batch = new MigrationBatch();
let generation = 0, processing = false, reveal = false, conflict = false;
const downloadUrls = new Set();
function status(message = '', error = false) { $('batch-status').textContent = message; $('batch-status').classList.toggle('error', error); }
function render() {
  const entries = batch.entries;
  $('part-count').textContent = `${batch.parts.size} / ${batch.size}`;
  $('account-count').textContent = String(entries.length);
  const ready = batch.complete && !conflict && !processing;
  $('export-txt').disabled = $('export-md').disabled = !ready;
  $('batch-integrity').classList.toggle('complete', ready);
  $('batch-integrity').textContent = conflict ? '批次存在冲突，请清空全部后重新导入同一批二维码。' : batch.complete ? `已收齐 ${batch.size} 张二维码，可以导出。` : batch.size ? `还缺第 ${batch.missing.join('、')} 张二维码。` : '导入后自动检查批次和缺失编号。';
  $('batch-empty').hidden = entries.length > 0;
  $('account-list').replaceChildren();
  entries.slice(0, 100).forEach((entry, index) => {
    const row = document.createElement('article'); row.className = 'account-row';
    const title = document.createElement('strong'); title.textContent = `${index + 1}. ${entry.name || '未提供名称'}`;
    const info = document.createElement('p'); info.textContent = `${entry.issuer || '未提供服务'} · ${entry.type.toUpperCase()} · ${entry.digits} 位 · ${entry.algorithm}`;
    const key = document.createElement('code'); key.textContent = reveal ? entry.secret : '••••••••••••••••';
    row.append(title, info, key); $('account-list').append(row);
  });
  $('preview-note').textContent = entries.length > 100 ? '预览显示前 100 个账号，下载文件包含全部账号。' : '';
}
function log(message, error = false) {
  const row = document.createElement('li'); row.textContent = message;
  if (error) row.className = 'error';
  $('import-log').append(row);
  if ($('import-log').children.length > 200) $('import-log').firstElementChild.remove();
}
function add(text, label) {
  const part = parseMigration(text);
  let added;
  try { added = batch.add(part); }
  catch (error) { conflict = true; throw error; }
  log(`${label}：第 ${part.index + 1} / ${part.size} 张，${added ? `导入 ${part.entries.length} 个账号` : '重复，已跳过'}。`);
  render();
}
function clear() {
  generation++; processing = false; reveal = false; conflict = false;
  batch.clear();
  for (const url of downloadUrls) URL.revokeObjectURL(url);
  downloadUrls.clear();
  $('batch-files').value = ''; $('batch-links').value = '';
  $('import-log').replaceChildren();
  $('show-keys').textContent = '显示密钥'; $('show-keys').setAttribute('aria-pressed', 'false');
  $('batch-dropzone').classList.remove('dragover');
  $('import-links').disabled = false;
  status(); render();
}
async function importFiles(files) {
  if (processing) return status('正在处理，请等这批图片完成后再添加。', true);
  if (!files.length) return;
  if (files.length > 100) return status('每次最多选择 100 张图片，可以分次添加。', true);
  const current = generation;
  processing = true; $('import-links').disabled = true; render();
  let errors = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      if (current !== generation) return;
      status(`正在处理第 ${i + 1} / ${files.length} 张图片…`);
      try {
        const content = await decodeQrImage(files[i]);
        if (current !== generation) return;
        add(content, `图片 ${i + 1}`);
      } catch (error) {
        if (current !== generation) return;
        errors++; log(`图片 ${i + 1}：${error.message || '识别失败。'}`, true);
      }
      files[i] = null;
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  } finally {
    files.fill(null);
    if (current === generation) {
      processing = false; $('import-links').disabled = false; render();
      status(errors ? `处理完成，${errors} 张未成功导入，请查看导入记录。` : batch.complete && !conflict ? '整批已收齐，选择 TXT 或 Markdown 下载。' : '已导入，请继续添加剩余二维码。', errors > 0 || conflict);
    }
  }
}
$('batch-dropzone').addEventListener('click', () => {
  if (processing) status('正在处理，请稍候。'); else $('batch-files').click();
});
$('batch-dropzone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); $('batch-dropzone').click(); } });
$('batch-files').addEventListener('change', event => { const files = [...event.target.files]; event.target.value = ''; void importFiles(files); });
for (const name of ['dragenter', 'dragover']) $('batch-dropzone').addEventListener(name, event => { event.preventDefault(); $('batch-dropzone').classList.add('dragover'); });
$('batch-dropzone').addEventListener('dragleave', () => $('batch-dropzone').classList.remove('dragover'));
$('batch-dropzone').addEventListener('drop', event => { event.preventDefault(); $('batch-dropzone').classList.remove('dragover'); void importFiles([...event.dataTransfer.files]); });
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
window.addEventListener('paste', event => {
  const files = [...(event.clipboardData?.items || [])].filter(item => item.type.startsWith('image/')).map(item => item.getAsFile()).filter(Boolean);
  if (files.length) { event.preventDefault(); void importFiles(files); }
});
$('import-links').addEventListener('click', () => {
  if (processing) return;
  const input = $('batch-links').value.trim(); $('batch-links').value = '';
  if (!input) return status('请先粘贴迁移链接。', true);
  const links = input.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (input.length > 400000 || links.length > 100) return status('单次最多导入 100 条链接，总长度不超过 400,000 字符。', true);
  let errors = 0;
  links.forEach((link, i) => { try { add(link, `链接 ${i + 1}`); } catch (error) { errors++; log(`链接 ${i + 1}：${error.message}`, true); } });
  render(); status(errors ? `${errors} 条未成功导入，请查看记录。` : batch.complete && !conflict ? '整批已收齐，可以下载。' : '已导入，请继续添加剩余二维码。', errors > 0 || conflict);
});
$('show-keys').addEventListener('click', () => { reveal = !reveal; $('show-keys').textContent = reveal ? '隐藏密钥' : '显示密钥'; $('show-keys').setAttribute('aria-pressed', String(reveal)); render(); });
$('clear-batch').addEventListener('click', clear);
function download(format) {
  if (processing || conflict || !batch.complete) return;
  try {
    const content = exportBatch(batch, format);
    const blob = new Blob(['\uFEFF', content], { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob); downloadUrls.add(url);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `authenticator-backup-${new Date().toISOString().slice(0, 10)}.${format}`;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.delete(url); }, 1000);
    status(`${format.toUpperCase()} 下载已开始，包含 ${batch.entries.length} 个账号。网页不会保留备份。`);
  } catch (error) { status(error.message, true); }
}
$('export-txt').addEventListener('click', () => download('txt'));
$('export-md').addEventListener('click', () => download('md'));
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
clear();
