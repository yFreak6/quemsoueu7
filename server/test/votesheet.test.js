// Geometria da folha de votação 3D (módulo puro do cliente): o X vermelho precisa passar das bordas
// da caixa sem ser cortado, e os registros precisam caber na folha para qualquer número de jogadores.

import assert from 'node:assert/strict';
import test from 'node:test';
import { CH, CW, X_EXTENT, X_MARK, X_STROKE, outsideBox, sheetCells } from '../../client/src/three/voteSheetLayout.js';

test('X vermelho: dois traços, com as DUAS extremidades fora do quadrado da caixa', () => {
  assert.equal(X_MARK.length, 2);
  for (const s of X_MARK) {
    assert.ok(outsideBox(s.p0), `início ${s.p0} dentro da caixa`);
    assert.ok(outsideBox(s.p1), `fim ${s.p1} dentro da caixa`);
    // ultrapassa claramente (pelo menos 10% do lado da caixa além da borda)
    assert.ok(Math.max(...s.p0.map(Math.abs)) >= 0.6 && Math.max(...s.p1.map(Math.abs)) >= 0.6);
  }
  // os dois traços são diagonais e se cruzam no meio da caixa
  const [a, b] = X_MARK;
  assert.ok(Math.sign(a.p1[0] - a.p0[0]) !== Math.sign(b.p1[0] - b.p0[0]));
});

test('X vermelho: nada é cortado — os traços (com a espessura) cabem no quadro da textura, que é maior que a caixa', () => {
  assert.ok(X_EXTENT > 0.5, 'o quadro do X precisa ser maior que a caixa (senão haveria recorte)');
  for (const s of X_MARK) {
    for (const p of [s.p0, s.p1, s.c]) for (const v of p) assert.ok(Math.abs(v) + X_STROKE / 2 < X_EXTENT, `traço sairia do quadro: ${v}`);
  }
});

test('folha: registros cabem na folha, sem se sobrepor, para 3 a 10 jogadores', () => {
  for (let n = 3; n <= 10; n++) {
    const cells = sheetCells(n);
    assert.equal(cells.length, n);
    for (const c of cells) {
      assert.ok(c.hit.x >= 0 && c.hit.y >= 0 && c.hit.x + c.hit.w <= CW && c.hit.y + c.hit.h <= CH, `n=${n}: registro fora da folha`);
      assert.ok(c.box.s < c.portrait.s, 'a caixa de voto é menor que o retrato');
      assert.ok(c.box.x > c.portrait.x + c.portrait.s, 'caixa ao lado do retrato');
      assert.ok(c.text.x > c.box.x + c.box.s, 'texto IMPOSTOR ao lado da caixa');
      assert.ok(c.label.y > c.portrait.y + c.portrait.s, '"JOGADOR" abaixo do retrato');
    }
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = cells[i].hit;
        const b = cells[j].hit;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `n=${n}: registros ${i} e ${j} se sobrepõem`);
      }
  }
});

test('folha: com 6 jogadores a composição é a da referência (2 colunas x 3 linhas)', () => {
  const cells = sheetCells(6);
  const xs = new Set(cells.map((c) => Math.round(c.portrait.x / (CW / 2))));
  const ys = new Set(cells.map((c) => Math.floor(c.portrait.y / (CH / 3))));
  assert.equal(xs.size, 2);
  assert.equal(ys.size, 3);
});
