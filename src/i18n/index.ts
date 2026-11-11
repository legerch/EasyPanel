/**
 * Minimal internationalisation: flat key → string dictionaries with
 * `{param}` placeholders. English is the reference dictionary; other
 * languages must define the same keys (checked by tests/i18n.test.ts).
 */
import { en } from './en';
import { fr } from './fr';

export type Lang = 'en' | 'fr';
export type MessageKey = keyof typeof en;

const DICTS: Record<Lang, Record<MessageKey, string>> = { en, fr };
export const LANGS: Array<{ id: Lang; label: string }> = [
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'Français' },
];

let current: Lang = 'en';

export function detectLang(preferred?: string): Lang {
  const candidates = [preferred, ...(typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [])];
  for (const c of candidates) {
    const base = c?.slice(0, 2).toLowerCase();
    if (base && base in DICTS) return base as Lang;
  }
  return 'en';
}

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function getLang(): Lang {
  return current;
}

/** Translates `key`, replacing `{name}` placeholders with `params.name`. Unknown keys are returned as-is (visible, never crash). */
export function t(key: string, params?: Record<string, string | number>): string {
  const dict = DICTS[current] as Record<string, string>;
  const template = dict[key] ?? (en as Record<string, string>)[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, p: string) => (p in params ? String(params[p]) : m));
}

/** Localised number formatting (e.g. "4,5" in French). */
export function formatNumber(v: number): string {
  return new Intl.NumberFormat(current).format(v);
}

export function formatDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(current, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' }).format(d);
}
