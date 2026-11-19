// Leitura da receita e da caixa do remédio, feita no próprio navegador.
// - Texto da receita (foto): Tesseract.js (OCR) roda no aparelho; só baixa o
//   "dicionário" de português na primeira vez.
// - QR code da receita digital e código de barras da caixa: BarcodeDetector do
//   navegador quando existe; se não, a biblioteca ZXing.

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

const scripts = new Map();
function carregarScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((ok, erro) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = ok;
      s.onerror = () => { scripts.delete(src); erro(new Error('rede')); };
      document.head.appendChild(s);
    }));
  }
  return scripts.get(src);
}

// Reduz a foto (fotos de celular têm 12 MP) e passa para tons de cinza.
async function prepararImagem(arquivo, max = 1800) {
  const bmp = await createImageBitmap(arquivo).catch(() => null);
  if (!bmp) throw new Error('imagem');
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

export async function lerTexto(arquivo, aoProgredir) {
  const canvas = await prepararImagem(arquivo);
  const g = canvas.getContext('2d');
  const px = g.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < px.data.length; i += 4) {
    const y = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
    px.data[i] = px.data[i + 1] = px.data[i + 2] = y;
  }
  g.putImageData(px, 0, 0);
  await carregarScript(TESSERACT);
  const worker = await window.Tesseract.createWorker('por', 1, {
    logger: (m) => { if (m.status === 'recognizing text' && aoProgredir) aoProgredir(m.progress); },
  });
  try {
    const { data } = await worker.recognize(canvas);
    return data.text || '';
  } finally {
    worker.terminate();
  }
}

export async function lerCodigo(arquivo) {
  const canvas = await prepararImagem(arquivo, 1400);
  if ('BarcodeDetector' in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'data_matrix'] });
      const r = await det.detect(canvas);
      if (r.length) return { formato: r[0].format, texto: r[0].rawValue };
    } catch { /* cai para a ZXing */ }
  }
  await carregarScript(ZXING);
  const Z = window.ZXing;
  const leitor = new Z.MultiFormatReader();
  const dicas = new Map();
  dicas.set(Z.DecodeHintType.TRY_HARDER, true);
  dicas.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.DATA_MATRIX]);
  leitor.setHints(dicas);
  const lum = new Z.HTMLCanvasElementLuminanceSource(canvas);
  for (const Bin of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
    try {
      const res = leitor.decode(new Z.BinaryBitmap(new Bin(lum)));
      return { formato: String(Z.BarcodeFormat[res.getBarcodeFormat()]).toLowerCase(), texto: res.getText() };
    } catch { /* tenta o próximo */ }
  }
  return null;
}
