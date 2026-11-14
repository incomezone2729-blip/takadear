import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Automatically register PWA service worker and check for updates
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onOfflineReady() {
      console.log('TakaDear PWA ready for offline use');
    },
  });
}

createRoot(document.getElementById('root')!).render(<App />);

