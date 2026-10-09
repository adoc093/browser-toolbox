# 小工具箱

纯静态浏览器工具箱，适合 GitHub Pages。两个独立栏目：二维码识别及验证器密钥提取、TOTP 动态验证码生成。

支持选择图片、拖拽图片、粘贴截图和直接解析文本。密钥默认隐藏。每张图片只返回一个二维码；多码图片请先裁剪。支持 PNG/JPEG/WebP/GIF/BMP，20 MB 文件上限。

动态验证码位于 `totp.html`，粘贴 Base32 密钥或完整 `otpauth://totp` 链接后生成。默认 SHA-1、6 位、30 秒，支持 SHA-256/SHA-512、8 位、5–300 秒周期，完整链接的参数优先。自动更新、倒计时及一键复制。依赖系统时间，请开启设备自动校时。这里不生成基于计数器的 HOTP。

## 隐私

- 图片通过 Blob URL 和内存 Canvas 解析，不上传。所有依赖随站点发布，不使用外部 CDN。
- 不使用 Cookie、localStorage、sessionStorage、IndexedDB、分析服务或后端；CSP `connect-src 'none'` 禁止网页发起网络连接。
- 结果只显示在页面中。清空、刷新、关闭页面及离开页面时清除应用结果。系统内存回收由浏览器管理；不承诺物理内存擦除。
- TOTP 使用浏览器 Web Crypto，导入的 HMAC 密钥不可导出；开始生成后清空输入框，仅在当前页内存保留计算所需的 CryptoKey。编辑输入或设置时停止旧验证码，清空或离开页面时停止计时并释放引用。
- 点击复制才会写系统剪贴板，页面清空不会清除系统剪贴板。
- GitHub 作为网页托管方会收到正常的页面/静态文件访问请求；扫描内容不包含在请求中。
- 请勿向仓库提交真实二维码、密钥或个人账号。此仓库仅包含程序及开源依赖。

## 本地运行

在本目录运行 `python3 -m http.server 8080 --bind 127.0.0.1`，访问 `http://127.0.0.1:8080`。复制功能需要 HTTPS 或 localhost。

## 发布

GitHub Pages 选择 `Deploy from a branch`，分支 `main`，目录 `/ (root)`。无需构建、服务器或 API 密钥。添加新工具时沿用本地处理和无持久化约定。

## 开源依赖

`vendor/jsQR.js` 来自 npm `jsqr@1.4.0`（[源项目](https://github.com/cozmo/jsQR)），许可证见 `vendor/jsQR.LICENSE`。

## 验证

`npm test` 使用 Node.js 22+，无需安装依赖。核对 [RFC 6238 Appendix B](https://www.rfc-editor.org/rfc/rfc6238#appendix-B) 的全部 18 个 SHA-1/SHA-256/SHA-512 测试向量，同时验证 6 位输出、Base32 解码及输入参数校验。测试密钥来自公开标准，不包含真实账号数据。
