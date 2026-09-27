import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Imported first so the i18next singleton is initialized — and the document's
// `lang`/`dir` applied — before the first render (Unit 12: no flicker, spec UI
// Behavior).
import '@/i18n';
import { App } from '@/App';
import '@/styles/shell.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root was not found in index.html.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
