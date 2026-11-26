import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { makeLabelTexture } from './labelTexture.js';
import { seatAngle } from './layout.js';
import { TEAM } from '../game/teams.jsx';
import { colorHex, sameLook } from '../game/look.js';
import { Face, Hat, Neck, OutfitExtras, outfitMat, paperPose } from './Accessories.jsx';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const AMBER = new THREE.Color('#ffb020');
const RED = new THREE.Color('#e5484d');
const BLACK = new THREE.Color('#000000');
const damp = THREE.MathUtils.damp;

const REACT_MS = 1100; // duração da reação ao chute errado
const ELIM_MS = 1800; // duração da animação de eliminação

/** Cápsula entre dois pontos: braços, pernas e tronco. */
function Limb({ from, to, radius, material }) {
  const { position, quaternion, length } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a);
    const len = dir.length();
    return {
      position: a.clone().add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir.normalize()),
      length: len,
    };
  }, [from, to]);

  return (
    <mesh position={position} quaternion={quaternion} castShadow material={material}>
      <capsuleGeometry args={[radius, Math.max(0.001, length - radius * 2), 3, 10]} />
    </mesh>
  );
}

// mangas: do ombro até uma fração do braço (arrays fixos para o Limb não recalcular)
const SLEEVE = {};
for (const [name, pts] of [['armL', [[0, 0, 0], [0.05, -0.27, 0.52]]], ['armR', [[0, 0, 0], [-0.05, -0.27, 0.52]]]]) {
  SLEEVE[name] = {};
  for (const f of [0.42, 0.92]) SLEEVE[name][f] = [pts[0], pts[1].map((v) => v * f)];
}
const TORSO_OVER = { tee: [[0, 0.72, 0], [0, 1.14, 0]], hoodie: [[0, 0.66, 0], [0, 1.14, 0]], suit: [[0, 0.66, 0], [0, 1.14, 0]] };
const SLEEVE_LEN = { tee: 0.42, hoodie: 0.92, suit: 0.92 };

function TurnMarker() {
  const ref = useRef();
  const ring = useRef();
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.position.y = 2.05 + Math.sin(clock.elapsedTime * 3) * 0.06;
      ref.current.rotation.y = clock.elapsedTime * 1.5;
    }
    if (ring.current) ring.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 3) * 0.05);
  });
  return (
    <group>
      <mesh ref={ref} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.1, 0.2, 4]} />
        <meshStandardMaterial color="#ffb020" emissive="#ff9800" emissiveIntensity={0.6} />
      </mesh>
      <mesh ref={ring} position={[0, 0.02, 0.05]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.64, 48]} />
        <meshBasicMaterial color="#ffb020" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

/** Selo fixo acima da cabeça de quem já acertou o personagem (modo EM TIMES). */
function SolvedTag() {
  return (
    <Html position={[0, 1.95, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className="select-none whitespace-nowrap rounded-full bg-felt px-2.5 py-0.5 text-xs font-black text-white shadow-lg" aria-hidden="true">
        ✓ ACERTOU
      </div>
    </Html>
  );
}

/** Coração que sobe e some quando o jogador perde uma vida. */
function LifeLoss({ id }) {
  return (
    <Html position={[0, 2.1, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div key={id} className="animate-float-up select-none text-2xl font-black text-red-600 drop-shadow-lg" aria-hidden="true">
        −1 ♥
      </div>
    </Html>
  );
}

const PTS = {
  torso: [[0, 0.62, 0], [0, 1.18, 0]],
  armL: [[0, 0, 0], [0.05, -0.27, 0.52]],
  armR: [[0, 0, 0], [-0.05, -0.27, 0.52]],
  thighL: [[-0.1, 0.58, 0], [-0.12, 0.58, 0.42]],
  thighR: [[0.1, 0.58, 0], [0.12, 0.58, 0.42]],
  shinL: [[-0.12, 0.58, 0.42], [-0.12, 0.1, 0.47]],
  shinR: [[0.12, 0.58, 0.42], [0.12, 0.1, 0.47]],
};

/**
 * Boneco sentado. Todas as animações são procedurais (sem arquivos): respiração, balanço,
 * movimento da cabeça, destaque de turno, reação a chute errado, eliminação e vitória.
 */
function DollImpl({ player, n, seatR, isTurn, reaction, isWinner }) {
  const a = seatAngle(player.seat, n);
  const position = [Math.sin(a) * seatR, 0, Math.cos(a) * seatR];
  const eliminated = player.eliminated;

  const look = player.look;
  // branco mantém o tom original (escalar 0.965); as outras cores vêm da paleta
  const baseColor = useMemo(() => (look?.color && look.color !== 'white' ? new THREE.Color(colorHex(look.color)) : new THREE.Color().setScalar(0.965)), [look?.color]);
  const body = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f6f6f3', roughness: 0.55, transparent: true, emissive: BLACK.clone() }), []);
  const badgeTex = useMemo(
    () => makeLabelTexture(player.nickname, { width: 384, height: 176, bg: '#ffffff', fg: '#16241c', stripe: player.judge ? '#e8b923' : player.team ? TEAM[player.team].color : '#2f9e63' }),
    [player.nickname, player.team, player.judge],
  );
  const paperTex = useMemo(
    () => (player.character ? makeLabelTexture(player.character, { width: 512, height: 256, bg: player.team ? TEAM[player.team].paper : '#fff176', fg: '#1f2a24' }) : null),
    [player.character, player.team],
  );
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => () => badgeTex.dispose(), [badgeTex]);
  useEffect(() => () => paperTex?.dispose(), [paperTex]);

  const root = useRef(); // elimina: afunda
  const torso = useRef(); // respiração e balanço
  const head = useRef();
  const armL = useRef();
  const armR = useRef();
  const paperMat = useRef();
  const badgeMat = useRef();

  // estado de animação mutável (não causa render)
  const anim = useRef({
    t0: Math.random() * 10,
    react: reaction?.id ?? null,
    reactAt: 0,
    elim: eliminated ? 1 : 0, // 0..1; já eliminado ao montar (reconexão) começa no fim
    elimAt: eliminated ? -1 : 0,
    wasElim: eliminated,
    turn: 0,
    win: 0,
  });

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const s = anim.current;
    const t = clock.elapsedTime + s.t0;
    const now = performance.now();

    // gatilho: chute errado
    if (reaction && reaction.id !== s.react) {
      s.react = reaction.id;
      s.reactAt = now;
    }
    // gatilho: eliminação
    if (eliminated && !s.wasElim) {
      s.wasElim = true;
      s.elimAt = now;
    }
    const reactP = s.reactAt ? (now - s.reactAt) / REACT_MS : 1; // 0..1 durante a reação
    const reacting = reactP >= 0 && reactP < 1;
    s.elim = eliminated ? (s.elimAt === -1 ? 1 : Math.min(1, (now - s.elimAt) / ELIM_MS)) : 0;
    s.turn = damp(s.turn, isTurn && !eliminated ? 1 : 0, 6, dt);
    s.win = damp(s.win, isWinner ? 1 : 0, 4, dt);

    // respiração e balanço leve
    const breathe = Math.sin(t * 1.6) * 0.012;
    const sway = Math.sin(t * 0.7) * 0.025;
    const e = s.elim;
    const slump = THREE.MathUtils.smoothstep(e, 0, 0.45); // desaba primeiro
    const sink = THREE.MathUtils.smoothstep(e, 0.45, 1); // depois afunda

    if (torso.current) {
      torso.current.scale.y = 1 + breathe * (1 - e);
      torso.current.rotation.z = sway * (1 - e) + (reacting ? Math.sin(reactP * 28) * 0.1 * (1 - reactP) : 0);
      torso.current.rotation.x = -0.35 * slump + s.turn * -0.04 + (reacting ? -0.12 * Math.sin(reactP * Math.PI) : 0);
      // vencedor pula de alegria
      torso.current.position.y = 0.62 + Math.abs(Math.sin(t * 5)) * 0.07 * s.win + s.turn * Math.sin(t * 3) * 0.012; // 0.62 = altura do pivô do tronco
    }
    if (head.current) {
      const look = Math.sin(t * 0.45) * 0.35 * (1 - s.turn * 0.8) * (1 - e);
      head.current.rotation.y = look + (reacting ? Math.sin(reactP * 22) * 0.45 * (1 - reactP) : 0);
      head.current.rotation.x = Math.sin(t * 0.9) * 0.04 + 0.75 * slump + (reacting ? 0.3 * Math.sin(reactP * Math.PI) : 0) - s.turn * 0.05;
      head.current.rotation.z = Math.sin(t * 0.6) * 0.03 + s.win * Math.sin(t * 6) * 0.12;
    }
    // braços: vencedor levanta; eliminado cai
    const armTarget = -1.9 * s.win + 0.55 * slump;
    for (const ref of [armL, armR]) {
      if (!ref.current) continue;
      ref.current.rotation.x = damp(ref.current.rotation.x, armTarget + Math.sin(t * 1.3) * 0.03, 8, dt) + (s.win ? Math.sin(t * 7) * 0.04 : 0);
    }
    if (root.current) root.current.position.y = -0.2 * sink;

    // materiais: brilho de turno, flash vermelho no erro, apagado ao eliminar
    const flash = reacting ? Math.sin(Math.min(1, reactP * 1.4) * Math.PI) : 0;
    body.emissive.copy(BLACK).lerp(AMBER, s.turn * (0.28 + 0.08 * Math.sin(t * 3))).lerp(RED, flash * 0.75);
    body.color.copy(baseColor).multiplyScalar(THREE.MathUtils.lerp(1, 0.57, e));
    const opacity = THREE.MathUtils.lerp(1, 0.38, sink);
    body.opacity = opacity;
    if (paperMat.current) paperMat.current.opacity = THREE.MathUtils.lerp(1, 0.85, sink); // o papel segue legível (revelação)
    if (badgeMat.current) badgeMat.current.opacity = opacity;
  });

  const faded = eliminated;

  return (
    <group position={position} rotation={[0, a + Math.PI, 0]}>
      <group ref={root}>
        <group ref={torso} position={[0, 0.62, 0]}>
          <group position={[0, -0.62, 0]}>
            <Limb from={PTS.torso[0]} to={PTS.torso[1]} radius={0.19} material={body} />

            {/* crachá com o nickname */}
            <mesh position={[0, 0.93, look && look.outfit !== 'none' ? 0.228 : 0.197]}>
              <planeGeometry args={[0.3, 0.138]} />
              <meshBasicMaterial ref={badgeMat} map={badgeTex} toneMapped={false} transparent />
            </mesh>

            {look && TORSO_OVER[look.outfit] && <Limb from={TORSO_OVER[look.outfit][0]} to={TORSO_OVER[look.outfit][1]} radius={0.205} material={outfitMat(look.outfitColor)} />}
            {look && look.outfit !== 'none' && <OutfitExtras outfit={look.outfit} color={look.outfitColor} />}
            <Neck neck={look?.neck} shift={look && look.outfit !== 'none' ? 0.035 : 0} />

            {/* braços: o pivô fica no ombro */}
            {[
              { ref: armL, x: -0.25, pts: PTS.armL },
              { ref: armR, x: 0.25, pts: PTS.armR },
            ].map(({ ref, x, pts }) => (
              <group key={x} ref={ref} position={[x, 1.12, 0]}>
                <Limb from={pts[0]} to={pts[1]} radius={0.065} material={body} />
                {look && SLEEVE_LEN[look.outfit] && (
                  <Limb from={SLEEVE[x < 0 ? 'armL' : 'armR'][SLEEVE_LEN[look.outfit]][0]} to={SLEEVE[x < 0 ? 'armL' : 'armR'][SLEEVE_LEN[look.outfit]][1]} radius={0.082} material={outfitMat(look.outfitColor)} />
                )}
                <mesh position={pts[1]} material={body} castShadow>
                  <sphereGeometry args={[0.07, 16, 12]} />
                </mesh>
              </group>
            ))}

            {/* cabeça: o pivô fica no pescoço */}
            <group ref={head} position={[0, 1.28, 0]}>
              <mesh position={[0, 0.14, 0]} castShadow material={body}>
                <sphereGeometry args={[0.17, 20, 14]} />
              </mesh>
              <Hat hat={look?.hat} />
              <Face face={look?.face} />
              {paperTex && (
                <group position={[0, paperPose(look?.hat, look?.face)[0], paperPose(look?.hat, look?.face)[1]]} rotation={[-0.15, 0, 0]}>
                  <mesh>
                    <planeGeometry args={[0.44, 0.22]} />
                    <meshBasicMaterial ref={paperMat} map={paperTex} toneMapped={false} transparent />
                  </mesh>
                  <mesh rotation={[0, Math.PI, 0]} position={[0, 0, -0.002]}>
                    <planeGeometry args={[0.44, 0.22]} />
                    <meshBasicMaterial color="#e6d84a" />
                  </mesh>
                </group>
              )}
            </group>
          </group>
        </group>

        {[PTS.thighL, PTS.thighR, PTS.shinL, PTS.shinR].map((leg, i) => (
          <Limb key={i} from={leg[0]} to={leg[1]} radius={i < 2 ? 0.09 : 0.075} material={body} />
        ))}
      </group>

      {isTurn && !faded && <TurnMarker />}
      {player.done && <SolvedTag />}
      {reaction && Date.now() - reaction.at < 3000 && <LifeLoss id={reaction.id} />}
    </group>
  );
}

// Só redesenha o boneco se algo que ele usa mudou (o estado do jogo chega inteiro a cada evento).
function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k] || (k === 'look' && sameLook(a[k], b[k])));
}
export default memo(DollImpl, (p, n) => shallowEqual(p.player, n.player) && p.n === n.n && p.seatR === n.seatR && p.isTurn === n.isTurn && p.isWinner === n.isWinner && p.reaction === n.reaction);
