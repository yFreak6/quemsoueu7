import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { seatAngle, TABLE_TOP } from './layout.js';
import { drawSheet, drawXMark } from './voteSheetCanvas.js';
import { CH, CW, X_EXTENT, sheetCells } from './voteSheetLayout.js';

/** Largura da folha para uma mesa de raio tableR (o retângulo cabe inteiro na mesa redonda). */
export const sheetWidth = (tableR) => tableR * 1.5;

/**
 * Folha física de votação sobre a mesa (referência: imagem enviada). Fica deitada no tampo, com o "topo"
 * voltado para o lado oposto ao de quem olha, então cada jogador a lê de frente.
 *  - camada 1: a folha (retratos, caixas de voto, textos)
 *  - camada 2: áreas clicáveis (invisíveis)
 *  - camada 3: o X vermelho, um plano MAIOR que a caixa, sem recorte, acima de tudo: os traços passam das bordas.
 * Os dados vêm só do estado público (jogadores, quem foi eliminado); papéis nunca passam por aqui.
 */
export default function VoteSheet({ players, n, camSeat, tableR, pickable, pickId, onPick, show }) {
  const W = sheetWidth(tableR);
  const H = (W * CH) / CW;
  const k = W / CW; // pixels do canvas -> unidades do mundo
  const cells = useMemo(() => sheetCells(players.length), [players.length]);
  const [hover, setHover] = useState(null);
  const root = useRef();
  const anim = useRef(0);

  // a textura só é refeita quando muda algo visível (quem está na folha, visual, apelido)
  const key = players.map((p) => `${p.id}|${p.nickname}|${JSON.stringify(p.look)}`).join(';');
  const sheetTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    drawSheet(canvas, players);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const xTex = useMemo(() => {
    const canvas = document.createElement('canvas');
    drawXMark(canvas, 512);
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  useEffect(() => () => sheetTex.dispose(), [sheetTex]);
  useEffect(() => () => xTex.dispose(), [xTex]);

  // "pousa" a folha na mesa
  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    anim.current = THREE.MathUtils.damp(anim.current, show ? 1 : 0, 5, dt);
    const a = anim.current;
    g.visible = a > 0.01;
    g.position.y = TABLE_TOP + 0.006 + (1 - a) * 0.45;
    g.scale.setScalar(0.7 + 0.3 * a);
  });

  const angle = seatAngle(camSeat, n);
  const wx = (px) => (px - CW / 2) * k;
  const wy = (py) => -(py - CH / 2) * k;

  return (
    <group ref={root} rotation={[0, angle, 0]} visible={false}>
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {/* sombra/borda do papel */}
        <mesh position={[0.012, -0.012, -0.002]}>
          <planeGeometry args={[W * 1.01, H * 1.01]} />
          <meshBasicMaterial color="#000" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <mesh>
          <planeGeometry args={[W, H]} />
          <meshBasicMaterial map={sheetTex} toneMapped={false} />
        </mesh>

        {players.map((p, i) => {
          const c = cells[i];
          const canPick = pickable.includes(p.id);
          const chosen = pickId === p.id;
          const hx = wx(c.hit.x + c.hit.w / 2);
          const hy = wy(c.hit.y + c.hit.h / 2);
          return (
            <group key={p.id}>
              {/* realce de quem está sob o cursor / foi escolhido (fora da textura, para não "marcar" a caixa) */}
              <mesh
                position={[hx, hy, 0.003]}
                onClick={canPick ? (e) => (e.stopPropagation(), onPick(p.id)) : undefined}
                onPointerOver={canPick ? (e) => (e.stopPropagation(), setHover(p.id), (document.body.style.cursor = 'pointer')) : undefined}
                onPointerOut={canPick ? () => (setHover((h) => (h === p.id ? null : h)), (document.body.style.cursor = '')) : undefined}
              >
                <planeGeometry args={[c.hit.w * k * 1.05, c.hit.h * k * 1.1]} />
                <meshBasicMaterial color={chosen ? '#2f9e63' : '#ffb020'} transparent opacity={chosen ? 0.32 : canPick && hover === p.id ? 0.22 : 0} depthWrite={false} />
              </mesh>
              {p.eliminated && <XMark key={`x-${p.id}`} tex={xTex} x={wx(c.box.cx)} y={wy(c.box.cy)} size={c.box.s * k * 2 * X_EXTENT} />}
            </group>
          );
        })}
      </group>
    </group>
  );
}

/** O X vermelho: plano maior que a caixa, em camada própria acima dela. Pequena animação de "riscar". */
function XMark({ tex, x, y, size }) {
  const ref = useRef();
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current = Math.min(1, t.current + dt * 3.2);
    const e = 1 - (1 - t.current) ** 3;
    if (ref.current) {
      ref.current.scale.setScalar(0.4 + 0.6 * e);
      ref.current.material.opacity = e;
    }
  });
  return (
    <mesh ref={ref} position={[x, y, 0.01]} renderOrder={10} userData={{ voteX: true }}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
