import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';
import CameraRig from './CameraRig.jsx';
import Doll from './Doll.jsx';
import JudgeBot from './JudgeBot.jsx';
import { tableLayout } from './layout.js';
import { resolveScenery } from './scenery/index.js';
import VoteSheet, { sheetWidth } from './VoteSheet.jsx';

/**
 * Guarda de desempenho: mede o FPS e, se estiver baixo, reduz a qualidade em etapas
 * (1º resolução, 2º sombras). Nunca sobe de volta, para não ficar oscilando.
 */
function PerformanceGuard() {
  const { gl, scene } = useThree();
  const acc = useRef({ t: 0, n: 0, level: 0, warm: 0, frame: 0 });

  // As sombras vêm de uma única luz e quase tudo é estático: redesenhar o mapa a cada 4 quadros
  // corta ~3/4 do custo de sombra sem diferença visível (bonecos mexem devagar).
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useFrame((_, dt) => {
    const a = acc.current;
    if (a.frame++ % 4 === 0) gl.shadowMap.needsUpdate = true;
    a.warm += dt;
    if (a.warm < 2.5 || a.level >= 3) return; // ignora o aquecimento (compilação de shaders)
    a.t += dt;
    a.n += 1;
    if (a.t < 1.5) return;
    const fps = a.n / a.t;
    a.t = 0;
    a.n = 0;
    if (fps >= 50) return;
    a.level += 1;
    if (a.level === 1) gl.setPixelRatio(Math.min(1, window.devicePixelRatio || 1));
    else if (a.level === 2) gl.setPixelRatio(0.75);
    else {
      gl.shadowMap.enabled = false;
      scene.traverse((o) => {
        if (o.material) [].concat(o.material).forEach((m) => (m.needsUpdate = true));
      });
    }
  });
  return null;
}


/**
 * Aquecimento da GPU. O three só compila o shader e envia a textura de um material na PRIMEIRA vez em que ele
 * aparece na tela: ao girar a câmera para o balcão, as prateleiras ou o neon, isso vira um travamento (o "lag ao virar").
 * Aqui tudo é compilado/enviado logo no começo (junto da animação de sorteio) e de novo quando entra algo novo.
 */
function GpuWarmup({ warmKey }) {
  const { gl, scene, camera } = useThree();
  const frames = useRef(0);
  const pending = useRef([4, 90]); // quadros (desde a última mudança) em que roda o aquecimento

  useLayoutEffect(() => {
    frames.current = 0;
    pending.current = [4, 90];
  }, [warmKey]);

  useFrame(() => {
    const f = ++frames.current;
    if (pending.current[0] !== f && pending.current[1] !== f) return;
    const seen = new Set();
    scene.traverse((o) => {
      if (!o.material) return;
      [].concat(o.material).forEach((m) => {
        for (const k of ['map', 'emissiveMap', 'alphaMap', 'bumpMap', 'normalMap', 'roughnessMap']) {
          const t = m[k];
          if (t && t.image && !seen.has(t)) {
            seen.add(t);
            try {
              gl.initTexture(t);
            } catch {
              /* textura ainda sem imagem pronta: o three envia depois, como antes */
            }
          }
        }
      });
    });
    try {
      (gl.compileAsync ? gl.compileAsync(scene, camera) : Promise.resolve(gl.compile(scene, camera))).catch(() => {});
    } catch {
      /* sem suporte: segue sem aquecer */
    }
  });
  return null;
}

/**
 * Cena 3D. Todos (inclusive o host) veem da cadeira do próprio jogador.
 * O boneco do assento de onde se olha NÃO é desenhado: é a "sua" cabeça.
 * A regra de visibilidade é garantida pelo servidor: o próprio papel nem chega aqui.
 */
export default function Scene({ state, reactions, vote = null }) {
  const { players, turn, you, result } = state;
  const n = players.length;
  const layout = tableLayout(n);
  const { seatR, tableR } = layout;
  const Scenery = resolveScenery(state.scenery); // o servidor sorteia o cenário uma vez por partida; todos recebem o mesmo

  // só os assentos importam para o ambiente (cadeiras): string estável evita re-render a cada mudança de estado
  const seatKey = players.map((p) => p.seat).join(',');
  const me = players.find((p) => p.id === you.id);
  const camSeat = me?.seat ?? 0;
  const turnSeat = players.find((p) => p.id === turn?.playerId)?.seat ?? null;
  // modos de impostor: durante a votação (e o resultado) a folha aparece na mesa e a câmera enquadra a mesa
  const imp = state.imp;
  const sheetOn = !!imp && (imp.stage === 'vote' || imp.stage === 'result') && state.phase === 'playing';
  const sheetPlayers = imp ? players.filter((p) => !p.spectator).sort((a, b) => a.seat - b.seat) : [];
  const pickable = sheetOn && imp.stage === 'vote' && vote?.canVote ? vote.eligible.filter((id) => id !== you.id) : [];

  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.25]} gl={{ powerPreference: 'high-performance', stencil: false, antialias: (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) < 1.5, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.8 }} camera={{ fov: 62, near: 0.1, far: 60, position: [0, 1.42, seatR] }}>
      <Scenery n={n} seatKey={seatKey} seatR={seatR} layout={layout} camSeat={camSeat} sheetOn={sheetOn} />

      <PerformanceGuard />
      <GpuWarmup warmKey={`${seatKey}|${n}|${state.jg?.mode ?? ''}|${imp ? 1 : 0}|${state.scenery ?? ''}`} />

      {players.map((p) =>
        p.seat === camSeat || p.spectator ? null : (
          <Doll
            key={p.id}
            player={p}
            n={n}
            seatR={seatR}
            isTurn={turn?.playerId === p.id}
            reaction={reactions[p.id]}
            isWinner={result?.winnerId === p.id || (state.jg?.stage === 'reveal' && state.jg.verdict?.winnerId === p.id)}
          />
        ),
      )}

      {/* O JULGADOR (IA): robô de TV no centro da mesa; "computando" enquanto a IA analisa as respostas */}
      {state.jg?.mode === 'judge_ai' && <JudgeBot n={n} camSeat={camSeat} computing={state.jg.aiState === 'computing'} />}

      {imp && sheetPlayers.length > 0 && (
        <VoteSheet players={sheetPlayers} n={n} camSeat={camSeat} tableR={tableR} show={sheetOn} pickable={pickable} pickId={vote?.pickId ?? null} onPick={vote?.onPick ?? (() => {})} />
      )}

      <CameraRig seat={camSeat} n={n} seatR={seatR} turnSeat={sheetOn ? null : turnSeat} shakeAt={reactions[you.id]?.at} overview={sheetOn ? { sheetW: sheetWidth(tableR) } : null} />
    </Canvas>
  );
}
