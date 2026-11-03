import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './Errorboundary.tsx'

// stop the mouse wheel from changing a focused number field
document.addEventListener(
  'wheel',
  () => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement && el.type === 'number') el.blur();
  },
  { passive: true },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)