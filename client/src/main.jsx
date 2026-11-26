import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installClickSounds } from './audio/sfx.js';
import { GameProvider } from './game/GameContext.jsx';
import './index.css';
import './theme.js';

installClickSounds();

createRoot(document.getElementById('root')).render(
  <GameProvider>
    <App />
  </GameProvider>,
);
