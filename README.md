# 小工具箱

纯静态浏览器工具箱，适合 GitHub Pages。首个工具：二维码识别及 `otpauth://totp` / `otpauth://hotp` 验证器密钥提取。

支持选择图片、拖拽图片、粘贴截图和直接解析文本。密钥默认隐藏。每张图片只返回一个二维码；多码图片请先裁剪。支持 PNG/JPEG/WebP/GIF/BMP，20 MB 文件上限。

## 隐私

- 图片通过 Blob URL 和内存 Canvas 解析，不上传。所有依赖随站点发布，不使用外部 CDN。
- 不使用 Cookie、localStorage、sessionStorage、IndexedDB、分析服务或后端；CSP `connect-src 'none'` 禁止网页发起网络连接。
- 结果只显示在页面中。清空、刷新、关闭页面及离开页面时清除应用结果。系统内存回收由浏览器管理；不承诺物理内存擦除。
- 点击复制才会写系统剪贴板，页面清空不会清除系统剪贴板。
- GitHub 作为网页托管方会收到正常的页面/静态文件访问请求；扫描内容不包含在请求中。
- 请勿向仓库提交真实二维码、密钥或个人账号。此仓库仅包含程序及开源依赖。

## 本地运行

在本目录运行 `python3 -m http.server 8080 --bind 127.0.0.1`，访问 `http://127.0.0.1:8080`。复制功能需要 HTTPS 或 localhost。

## 发布

GitHub Pages 选择 `Deploy from a branch`，分支 `main`，目录 `/ (root)`。无需构建、服务器或 API 密钥。添加新工具时沿用本地处理和无持久化约定。

## 开源依赖

`vendor/jsQR.js` 来自 npm `jsqr@1.4.0`（[源项目](https://github.com/cozmo/jsQR)），许可证见 `vendor/jsQR.LICENSE`。
