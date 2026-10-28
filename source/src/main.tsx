import { createRoot } from 'react-dom/client';
import '@fontsource/vazirmatn/200.css';
import '@fontsource/vazirmatn/400.css';
import '@fontsource/vazirmatn/500.css';
import '@fontsource/vazirmatn/600.css';
import '@fontsource/vazirmatn/700.css';
// The sentence font ships with Nova: Windows has no Naskh face and fell back to Times New Roman.
import '@fontsource/noto-naskh-arabic/arabic-400.css';
import '@fontsource/noto-naskh-arabic/arabic-500.css';
import '@fontsource/noto-naskh-arabic/arabic-600.css';
import '@fontsource/noto-naskh-arabic/arabic-700.css';
import './styles.css';
import './widgets'; // registers every built-in widget
import { useStore } from './core/state';
import App from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { installLocalOriginRule } from './core/providers/ai';

void useStore.getState().load();
// Handy from DevTools: novaStore.getState()
(globalThis as unknown as { novaStore: typeof useStore }).novaStore = useStore;
// For tests and the curious: the sentence engine (loaded on demand).
(globalThis as unknown as { novaSentences: () => Promise<unknown> }).novaSentences = () => import('./core/sentences');
void installLocalOriginRule();
// The phone/web app: offline cache, «new version» prompt, and home-screen shortcuts.
if (import.meta.env.VITE_TARGET === 'web') void import('./web/pwa').then((m) => m.startPwa());
createRoot(document.getElementById('root')!).render(<ErrorBoundary label="Ora" page><App /></ErrorBoundary>);
