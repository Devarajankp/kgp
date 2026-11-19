import {inject} from '@vercel/analytics';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

inject();
registerSW({immediate: true});

createRoot(document.getElementById('root')!).render(<App />);
