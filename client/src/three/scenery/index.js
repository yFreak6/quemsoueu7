// Registro de cenários 3D. O servidor sorteia o id (server/game/scenery.js) e o envia em state.scenery;
// aqui cada id aponta para o componente que desenha o ambiente.
//
// PARA ADICIONAR UM CENÁRIO NOVO (ex.: 'praia'):
//   1. server/game/scenery.js  -> acrescente 'praia' em SCENERIES;
//   2. crie client/src/three/scenery/PraiaScenery.jsx (props abaixo) e registre-o neste arquivo.
// A mesa, as cadeiras, os bonecos, a câmera e o HUD são comuns a todos e não precisam ser tocados.
//
// Contrato do componente de cenário (renderizado dentro do <Canvas>, antes dos bonecos):
//   props: { n, seatKey, seatR, layout, camSeat, sheetOn }
//     n        número de jogadores         seatKey  assentos ocupados, "0,1,2" (string estável)
//     seatR    raio dos assentos           layout   tableLayout(n) (seatR, tableR, roomR, wallH)
//     camSeat  assento de quem vê          sheetOn  folha de votação aberta (mesa sem enfeites)
//   deve renderizar: fundo/névoa, luzes, mesa (GameTable), cadeiras (Chair) e o ambiente em volta.
// Mantenha tudo dentro do raio de visão (câmera far = 60) e use poucas luzes/sombras.
import BarScenery from './BarScenery.jsx';
import TruckScenery from './TruckScenery.jsx';

export const DEFAULT_SCENERY = 'bar';

export const SCENERIES = {
  bar: { label: 'Bar', Component: BarScenery },
  truck: { label: 'Caminhonete na rodovia', Component: TruckScenery },
};

/** Id desconhecido, ausente ou de um servidor antigo (sem o campo) cai no bar — o jogo nunca fica sem cenário. */
export function resolveScenery(id) {
  return (SCENERIES[id] ?? SCENERIES[DEFAULT_SCENERY]).Component;
}
