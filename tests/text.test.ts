import { describe, expect, it } from 'vitest';
import { bottomText, mainText } from '../src/model/deviceText';
import { esc, fitBlock, wrap } from '../src/render/text';

describe('device texts', () => {
  it('derives standard markings', () => {
    expect(mainText('breaker', { rating: 20, curve: 'C' })).toBe('C20');
    expect(mainText('rcd', { rating: 63 })).toBe('63A');
    expect(bottomText('rcd', { sensitivity: 30, diffType: 'A' })).toBe('30mA A');
    expect(mainText('breaker', { rating: 20, curve: 'C', text: ' Custom ' })).toBe('Custom');
    expect(bottomText('rcbo', { sensitivity: 30, secondary: 'note' })).toBe('note');
    expect(mainText('outlet', { rating: 16 })).toBe('');
  });
});

describe('text fitting (approximate metrics outside the browser)', () => {
  it('wraps words and breaks words that are too long', () => {
    expect(wrap('Prises chambre parentale', 10, 2).length).toBeGreaterThan(1);
    expect(wrap('Supercalifragilistic', 5, 2).every((l) => l.length > 0)).toBe(true);
  });

  it('shrinks text to fit and truncates as a last resort', () => {
    const b = fitBlock('Éclairage', 16, 20, 4, 1.5);
    expect(b.size).toBeLessThanOrEqual(4);
    expect(b.lines.length * b.lineHeight).toBeLessThanOrEqual(20);
    const huge = fitBlock('word '.repeat(200), 10, 5, 4, 1.5);
    expect(huge.lines[huge.lines.length - 1].endsWith('…')).toBe(true);
  });

  it('escapes markup', () => {
    expect(esc('<a & "b">')).toBe('&lt;a &amp; &quot;b&quot;&gt;');
  });
});

describe('label wrapping preferences', () => {
  it('prefers a smaller font over cutting a word', () => {
    const b = fitBlock('Éclairage séjour', 16.4, 20.4, 4.2, 1.5);
    expect(b.lines).toEqual(['Éclairage', 'séjour']);
  });

  it('breaks after hyphens', () => {
    expect(wrap('Lave-vaisselle', 11, 2)).toEqual(['Lave-', 'vaisselle']);
  });
});
