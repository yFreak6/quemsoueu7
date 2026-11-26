import { useEffect, useState } from 'react';
import { useGameSounds } from '../audio/useGameSounds.js';
import { useGame } from '../game/GameContext.jsx';
import EndScreen from '../hud/EndScreen.jsx';
import DrawIntro from '../hud/DrawIntro.jsx';
import HUD from '../hud/HUD.jsx';
import SceneBoundary from '../components/SceneBoundary.jsx';
import { RevealOverlay } from '../hud/ImpostorHud.jsx';
import Scene from '../three/Scene.jsx';

export default function GameView() {
  const { state, reactions } = useGame();
  useGameSounds();

  // voto dos modos de impostor: a escolha (ainda não confirmada) é compartilhada entre a folha 3D e o painel
  const [pickId, setPickId] = useState(null);
  const v = state.imp?.vote;
  const canVote = state.imp?.stage === 'vote' && v?.step === 'voting' && v.eligible.includes(state.you.id) && !v.myVote;
  useEffect(() => setPickId(null), [v?.id]);
  const vote = state.imp ? { canVote, eligible: v?.eligible ?? [], pickId, onPick: setPickId } : null;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        <SceneBoundary>
          <Scene state={state} reactions={reactions} vote={vote} />
        </SceneBoundary>
      </div>
      <HUD vote={vote} />
      <RevealOverlay />
      <DrawIntro />
      {state.phase === 'finished' && <EndScreen />}
    </div>
  );
}
