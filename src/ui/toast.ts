/** Non-blocking notifications. Errors stay longer and can be dismissed manually. */
import { h } from './dom';
import { icon } from './icons';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

let container: HTMLElement | null = null;

export function toast(message: string, kind: ToastKind = 'info', durationMs?: number): void {
  if (!container) {
    container = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(container);
  }
  const close = h('button', { class: 'toast-close', type: 'button', 'aria-label': '×' }, icon('close'));
  const el = h('div', { class: `toast toast-${kind}` }, h('span', {}, message), close);
  const remove = () => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  };
  close.addEventListener('click', remove);
  container.appendChild(el);
  const duration = durationMs ?? (kind === 'error' ? 9000 : kind === 'warning' ? 6000 : 2800);
  if (duration > 0) setTimeout(remove, duration);
}
