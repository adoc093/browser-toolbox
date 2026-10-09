export async function decodeQrImage(file) {
  if (!file || !/^image\/(png|jpeg|webp|gif|bmp|x-ms-bmp)$/.test(file.type)) throw new Error('请选择 PNG、JPG、WebP、GIF 或 BMP 图片。');
  if (file.size > 20 * 1024 * 1024) throw new Error('图片超过 20 MB，请先裁剪或压缩。');
  const url = URL.createObjectURL(file), img = new Image(), canvas = document.createElement('canvas');
  try {
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('无法读取图片。')); img.src = url; });
    if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，请先裁剪。');
    const scale = Math.min(1, 2800 / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let result;
    try { result = globalThis.jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: 'attemptBoth' }); }
    finally { pixels.data.fill(0); }
    if (!result && globalThis.ZXingWASM) {
      const codes = await globalThis.ZXingWASM.readBarcodes(file, { formats: ['QRCode'], tryHarder: true });
      if (codes.length > 1) throw new Error('图片中有多枚二维码，请每张图片只保留一枚。');
      if (codes[0]) result = { data: codes[0].text };
    }
    if (!result) throw new Error('没有识别到二维码，请裁剪二维码区域并保留四周白边。');
    return result.data;
  } finally { img.onload = img.onerror = null; img.src = ''; canvas.width = canvas.height = 0; URL.revokeObjectURL(url); }
}
