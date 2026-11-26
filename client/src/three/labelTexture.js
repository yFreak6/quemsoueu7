import * as THREE from 'three';

// Texto desenhado num <canvas> 2D e usado como textura: crachás e papéis na testa
// não dependem de fontes ou arquivos externos.

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function makeLabelTexture(text, { width = 512, height = 256, bg = '#fff', fg = '#16241c', stripe } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  if (stripe) {
    ctx.fillStyle = stripe;
    ctx.fillRect(0, 0, width, height * 0.2);
  }

  const pad = 28;
  const top = stripe ? height * 0.2 : 0;
  const boxH = height - top - pad;
  const family = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const safe = String(text ?? '');

  // Maior fonte em que o texto cabe, quebrando em até 3 linhas
  let size = 130;
  let lines = [safe];
  for (; size >= 22; size -= 4) {
    ctx.font = `800 ${size}px ${family}`;
    lines = wrap(ctx, safe, width - pad * 2);
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (lines.length <= 3 && lines.length * size * 1.12 <= boxH && widest <= width - pad * 2) break;
  }

  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lineH = size * 1.12;
  const startY = top + (height - top) / 2 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => ctx.fillText(l, width / 2, startY + i * lineH));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
