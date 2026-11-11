import './style.css';
import { App } from './app';
import { detectLang, setLang } from './i18n';
import { loadPrefs } from './store/persistence';

setLang(detectLang(loadPrefs().lang));

const root = document.getElementById('app');
if (!root) throw new Error('#app element missing');

try {
  new App(root);
} catch (e) {
  // Last-resort error screen: the app could not start at all.
  console.error(e);
  root.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'fatal';
  box.textContent = `EasyPanel could not start: ${e instanceof Error ? e.message : String(e)}`;
  root.appendChild(box);
}
