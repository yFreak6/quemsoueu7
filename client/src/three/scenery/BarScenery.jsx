import Environment from '../Environment.jsx';
import Npcs from '../Npcs.jsx';
import { FreezeStatic } from '../sceneUtils.jsx';

/**
 * Cenário 'bar' (o original). O conteúdo é exatamente o que antes ficava direto em Scene.jsx:
 * fundo, névoa, luzes, o ambiente do bar e os NPCs. Nada aqui foi alterado, só movido.
 */
export default function BarScenery({ n, seatKey, seatR, layout, sheetOn }) {
  const { tableR } = layout;
  return (
    <>
      <color attach="background" args={['#1d1210']} />
      <fog attach="fog" args={['#1d1210', layout.roomR * 0.8, layout.roomR * 1.6]} />

      {/* luz de bar: ambiente quente e baixo + luz principal para sombras suaves + lâmpada sobre a mesa + neon */}
      <ambientLight intensity={0.36} color="#ffd9a8" />
      <hemisphereLight args={['#ffe2b8', '#5a3a22', 0.55]} />
      <directionalLight position={[4, 8, 3]} intensity={0.5} color="#ffd9a0" />

      <FreezeStatic freezeKey={`${seatKey}|${n}|${sheetOn}`}>
        <Environment seats={seatKey} n={n} seatR={seatR} tableR={tableR} roomR={layout.roomR} wallH={layout.wallH} decor={!sheetOn} />
      </FreezeStatic>

      <Npcs seatR={seatR} roomR={layout.roomR} />
    </>
  );
}
