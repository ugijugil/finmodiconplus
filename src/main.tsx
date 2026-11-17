import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@/components/arc/foundation.css';
import './styles.css';

// Tema ARC mengikuti pengaturan sistem; aksen biru.
const mq = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
applyTheme();
mq.addEventListener('change', applyTheme);
document.documentElement.setAttribute('data-accent', 'blue');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
