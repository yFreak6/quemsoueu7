import SoundToggle from './components/SoundToggle.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import Toasts from './components/Toasts.jsx';
import { useGame } from './game/GameContext.jsx';
import GameView from './screens/GameView.jsx';
import Home from './screens/Home.jsx';
import Lobby from './screens/Lobby.jsx';

export default function App() {
  const { state, booting, connected } = useGame();

  let screen;
  let key;
  if (booting) {
    key = 'boot';
    screen = (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-4 border-felt border-t-transparent" />
          <p className="font-semibold text-ink/70">Reconectando à sala…</p>
        </div>
      </div>
    );
  } else if (!state) {
    key = 'home';
    screen = <Home />;
  } else if (state.phase === 'lobby') {
    key = 'lobby';
    screen = <Lobby />;
  } else {
    key = 'game';
    screen = <GameView />;
  }

  return (
    <>
      {/* a chave troca a tela inteira, e a animação de entrada faz a transição suave */}
      <div key={key} data-menu={key !== 'game' ? '' : undefined} className="h-full animate-fade-in">
        {screen}
      </div>
      {key !== 'game' && <ThemeToggle className="fixed right-14 top-3 z-40" />}
      {key !== 'game' && <SoundToggle className="fixed right-3 top-3 z-40" />}
      <Toasts />
      {!connected && (
        <div role="alert" className="fixed inset-x-0 bottom-0 z-50 bg-amber-500 py-1.5 text-center text-sm font-semibold text-white">
          Sem conexão com o servidor. Tentando reconectar…
        </div>
      )}
    </>
  );
}
