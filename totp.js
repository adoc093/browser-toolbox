import { parseTotpInput, createTotpKey, generateTotp } from './totp-core.js';
const $ = id => document.getElementById(id);
let version = 0, active = null, timer = null, lastCounter = -1, busy = false;
function status(text = '', error = false) {
  $('totp-status').textContent = text;
  $('totp-status').classList.toggle('error', error);
}
function stop() {
  version++;
  clearInterval(timer);
  timer = active = null;
  lastCounter = -1;
  busy = false;
  $('code').textContent = '';
  $('remaining').textContent = '';
  $('totp-settings').textContent = '';
  $('lifetime').value = 0;
  $('copy-code').disabled = true;
  $('totp-result').hidden = true;
  $('totp-empty').hidden = false;
  $('generate').disabled = false;
  status();
}
function clear() {
  stop();
  $('totp-secret').value = '';
  $('totp-secret').type = 'password';
  $('toggle-secret').textContent = '显示';
  $('toggle-secret').setAttribute('aria-pressed', 'false');
  $('digits').value = '6';
  $('period').value = '30';
  $('algorithm').value = 'SHA-1';
}
async function tick() {
  if (!active || busy) return;
  const now = Date.now() / 1000;
  const counter = Math.floor(now / active.period);
  const remaining = active.period - now % active.period;
  $('remaining').textContent = `${Math.ceil(remaining)} 秒`;
  $('lifetime').value = remaining;
  if (counter === lastCounter) return;
  const current = version, config = active;
  busy = true;
  $('copy-code').disabled = true;
  $('code').textContent = '';
  try {
    const code = await generateTotp(config.key, config, now);
    if (current !== version) return;
    if (Math.floor(Date.now() / 1000 / config.period) !== counter) return;
    const updated = lastCounter !== -1;
    lastCounter = counter;
    $('code').textContent = code;
    $('copy-code').disabled = false;
    $('totp-empty').hidden = true;
    $('totp-result').hidden = false;
    if (updated) status('验证码已更新，请复制当前验证码。');
  } catch {
    if (current === version) { stop(); status('生成失败，请检查浏览器和系统时间后重试。', true); }
  } finally { if (current === version) busy = false; }
}
async function start() {
  stop();
  const current = version;
  $('generate').disabled = true;
  try {
    const config = parseTotpInput($('totp-secret').value, { digits: $('digits').value, period: $('period').value, algorithm: $('algorithm').value });
    const key = await createTotpKey(config.secret, config.algorithm);
    if (current !== version) return;
    active = { key, digits: config.digits, period: config.period, algorithm: config.algorithm };
    $('totp-secret').value = '';
    config.secret = '';
    $('totp-secret').type = 'password';
    $('toggle-secret').textContent = '显示';
    $('toggle-secret').setAttribute('aria-pressed', 'false');
    $('digits').value = String(active.digits);
    $('period').value = String(active.period);
    $('algorithm').value = active.algorithm;
    $('totp-settings').textContent = `${active.digits} 位 · ${active.period} 秒更新 · ${active.algorithm}`;
    $('lifetime').max = active.period;
    await tick();
    if (current !== version) return;
    timer = setInterval(() => void tick(), 250);
    status('已生成。密钥输入已清空，计算仅在当前页面继续。');
  } catch (error) {
    if (current === version) status(error.message || '生成失败，请检查密钥。', true);
  } finally { if (current === version) $('generate').disabled = false; }
}
$('generate').addEventListener('click', () => void start());
$('totp-secret').addEventListener('keydown', event => { if (event.key === 'Enter') void start(); });
for (const id of ['totp-secret', 'digits', 'period', 'algorithm']) $(id).addEventListener('input', stop);
$('clear-totp').addEventListener('click', clear);
$('toggle-secret').addEventListener('click', () => {
  const show = $('totp-secret').type === 'password';
  $('totp-secret').type = show ? 'text' : 'password';
  $('toggle-secret').textContent = show ? '隐藏' : '显示';
  $('toggle-secret').setAttribute('aria-pressed', String(show));
});
$('copy-code').addEventListener('click', async () => {
  await tick();
  const code = $('code').textContent, current = version;
  if (!code || $('copy-code').disabled) return;
  try {
    await navigator.clipboard.writeText(code);
    if (current === version) status('验证码已复制，请在倒计时结束前粘贴到网站。');
  } catch { if (current === version) status('浏览器未允许复制，请选中验证码手动复制。', true); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) void tick(); });
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', event => { if (event.persisted) clear(); });
clear();
