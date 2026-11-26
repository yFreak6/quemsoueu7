import * as THREE from 'three';
import { colorHex, outfitHex } from '../game/look.js';
import { CH, CW, X_EXTENT, X_MARK, X_STROKE, sheetCells } from './voteSheetLayout.js';

// Desenho 2D da folha (textura) e do X vermelho (outra textura, em outra camada).

const INK = '#0c0c0c';
const PAPER = '#c6c6c4'; // cinza da imagem de referência

const mix = (hex, to, t) => {
  const a = new THREE.Color(hex);
  return '#' + a.lerp(new THREE.Color(to), t).getHexString();
};

/** Retrato do boneco (cabeça + ombros) com a cor e os acessórios escolhidos no menu de personalização. */
function drawPortrait(ctx, x, y, s, look = {}) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, s, s);
  ctx.beginPath();
  ctx.rect(x, y, s, s);
  ctx.clip(); // o retrato é cortado no próprio quadro (isso NÃO afeta o X, que fica em outra camada)

  const base = look.color && look.color !== 'white' ? colorHex(look.color) : '#e4e4e2';
  const cx = x + s * 0.5;
  // ombros
  const shoulder = look.outfit && look.outfit !== 'none' ? outfitHex(look.outfitColor) : mix(base, '#000000', 0.08);
  const gs = ctx.createLinearGradient(0, y + s * 0.7, 0, y + s);
  gs.addColorStop(0, shoulder);
  gs.addColorStop(1, mix(shoulder, '#000000', 0.22));
  ctx.fillStyle = gs;
  ctx.beginPath();
  ctx.moveTo(x + s * 0.12, y + s);
  ctx.bezierCurveTo(x + s * 0.18, y + s * 0.74, x + s * 0.34, y + s * 0.68, cx, y + s * 0.68);
  ctx.bezierCurveTo(x + s * 0.66, y + s * 0.68, x + s * 0.82, y + s * 0.74, x + s * 0.88, y + s);
  ctx.closePath();
  ctx.fill();
  // cachecol / gravata-borboleta
  if (look.neck === 'scarf') {
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(x + s * 0.34, y + s * 0.64, s * 0.32, s * 0.08);
  } else if (look.neck === 'bowtie') {
    ctx.fillStyle = '#b3262b';
    ctx.beginPath();
    ctx.moveTo(cx, y + s * 0.7);
    ctx.lineTo(cx - s * 0.1, y + s * 0.65);
    ctx.lineTo(cx - s * 0.1, y + s * 0.75);
    ctx.closePath();
    ctx.moveTo(cx, y + s * 0.7);
    ctx.lineTo(cx + s * 0.1, y + s * 0.65);
    ctx.lineTo(cx + s * 0.1, y + s * 0.75);
    ctx.closePath();
    ctx.fill();
  }
  // cabeça com sombreamento suave (como na referência)
  const hr = s * 0.29;
  const hy = y + s * 0.4;
  const gh = ctx.createRadialGradient(cx - hr * 0.25, hy - hr * 0.3, hr * 0.1, cx, hy, hr * 1.05);
  gh.addColorStop(0, mix(base, '#000000', 0.28));
  gh.addColorStop(0.45, base);
  gh.addColorStop(1, mix(base, '#000000', 0.12));
  ctx.fillStyle = gh;
  ctx.beginPath();
  ctx.arc(cx, hy, hr, 0, Math.PI * 2);
  ctx.fill();
  // rosto
  if (look.face === 'glasses' || look.face === 'sunglasses') {
    ctx.strokeStyle = '#1b1b1b';
    ctx.fillStyle = look.face === 'sunglasses' ? '#111' : 'rgba(255,255,255,.35)';
    ctx.lineWidth = s * 0.014;
    for (const dx of [-0.11, 0.11]) {
      ctx.beginPath();
      ctx.arc(cx + s * dx, hy + hr * 0.1, s * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  } else if (look.face === 'mustache') {
    ctx.fillStyle = '#3a2a22';
    ctx.beginPath();
    ctx.ellipse(cx - s * 0.05, hy + hr * 0.5, s * 0.06, s * 0.025, 0.2, 0, Math.PI * 2);
    ctx.ellipse(cx + s * 0.05, hy + hr * 0.5, s * 0.06, s * 0.025, -0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // chapéus (formas simples)
  const top = hy - hr;
  const hatColors = { cap: '#3f7fd6', beanie: '#d9534f', tophat: '#1f1f24', crown: '#e8bf3c', party: '#a855f7' };
  const hc = hatColors[look.hat];
  if (hc) {
    ctx.fillStyle = hc;
    ctx.beginPath();
    if (look.hat === 'tophat') {
      ctx.rect(cx - s * 0.17, top - s * 0.2, s * 0.34, s * 0.24);
      ctx.rect(cx - s * 0.26, top + s * 0.03, s * 0.52, s * 0.04);
    } else if (look.hat === 'crown') {
      ctx.moveTo(cx - s * 0.2, top + s * 0.06);
      ctx.lineTo(cx - s * 0.2, top - s * 0.1);
      ctx.lineTo(cx - s * 0.1, top - s * 0.02);
      ctx.lineTo(cx, top - s * 0.13);
      ctx.lineTo(cx + s * 0.1, top - s * 0.02);
      ctx.lineTo(cx + s * 0.2, top - s * 0.1);
      ctx.lineTo(cx + s * 0.2, top + s * 0.06);
    } else if (look.hat === 'party') {
      ctx.moveTo(cx - s * 0.14, top + s * 0.06);
      ctx.lineTo(cx, top - s * 0.22);
      ctx.lineTo(cx + s * 0.14, top + s * 0.06);
    } else {
      ctx.ellipse(cx, top + s * 0.07, s * 0.27, s * 0.16, 0, Math.PI, 0);
      if (look.hat === 'cap') ctx.rect(cx - s * 0.05, top + s * 0.06, s * 0.36, s * 0.03);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // moldura preta grossa
  ctx.strokeStyle = INK;
  ctx.lineWidth = s * 0.026;
  ctx.strokeRect(x, y, s, s);
}

/** Folha inteira SEM nenhum X: o X é desenhado à parte, numa camada acima. */
export function drawSheet(canvas, players) {
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CW, CH);
  const cells = sheetCells(players.length);
  players.forEach((p, i) => {
    const c = cells[i];
    drawPortrait(ctx, c.portrait.x, c.portrait.y, c.portrait.s, p.look);
    // caixa de voto (quadrado preto vazado) e texto IMPOSTOR
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(c.box.x, c.box.y, c.box.s, c.box.s);
    ctx.strokeStyle = INK;
    ctx.lineWidth = c.box.s * 0.075;
    ctx.strokeRect(c.box.x, c.box.y, c.box.s, c.box.s);
    ctx.fillStyle = INK;
    ctx.font = `500 ${c.text.font}px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('IMPOSTOR', c.text.x, c.text.y);
    // "JOGADOR" (como na referência) e, logo abaixo, o apelido de quem é
    ctx.textAlign = 'center';
    ctx.font = `500 ${c.label.font}px "Segoe UI", Arial, sans-serif`;
    ctx.fillText('JOGADOR', c.label.x, c.label.y);
    ctx.font = `700 ${c.label.font * 1.15}px "Segoe UI", Arial, sans-serif`;
    let name = p.nickname;
    while (ctx.measureText(name).width > c.portrait.s * 1.5 && name.length > 3) name = name.slice(0, -2) + '…';
    ctx.fillText(name, c.label.x, c.label.y + c.label.font * 1.5);
  });
}

/**
 * Textura do X vermelho: dois traços de marcador (curvos, pontas arredondadas) que SAEM da caixa.
 * Quadro: 2*X_EXTENT unidades de caixa de lado; fundo transparente. Nenhum recorte.
 */
export function drawXMark(canvas, px = 512) {
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, px, px);
  const u = px / (2 * X_EXTENT); // pixels por unidade de caixa
  const T = ([x, y]) => [(x + X_EXTENT) * u, (y + X_EXTENT) * u];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const pass of [{ w: 1.0, color: '#e8202c' }]) {
    ctx.strokeStyle = pass.color;
    ctx.lineWidth = X_STROKE * u * pass.w;
    for (const s of X_MARK) {
      const [x0, y0] = T(s.p0);
      const [cx, cy] = T(s.c);
      const [x1, y1] = T(s.p1);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx, cy, x1, y1);
      ctx.stroke();
    }
  }
}
