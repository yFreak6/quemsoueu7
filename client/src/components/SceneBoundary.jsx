import { Component } from 'react';

/** Se a cena 3D falhar, mostra o erro em vez de derrubar o app inteiro (tela toda branca). */
export default class SceneBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Erro na cena 3D:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center bg-[#1d1210] p-6 text-center text-white">
        <div className="max-w-md">
          <p className="text-xl font-extrabold">Não foi possível desenhar a mesa 3D</p>
          <p className="mt-2 text-sm text-white/70">{String(this.state.error?.message ?? this.state.error)}</p>
          <button type="button" onClick={() => location.reload()} className="mt-4 rounded-xl bg-white px-4 py-2 font-extrabold text-black">
            Recarregar
          </button>
        </div>
      </div>
    );
  }
}
