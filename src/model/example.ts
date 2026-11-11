/**
 * Example project: a typical two-row French residential panel.
 * Circuit labels are illustrative only.
 */
import { addDevice, createProject, type NewDevice } from './project';
import type { DiffType, Project } from './types';

const rcd = (rating: number, diffType: DiffType, label: string): NewDevice => ({
  kind: 'rcd',
  width: 2,
  props: { rating, diffType, sensitivity: 30, poles: '2P', label },
});
const cb = (rating: number, label: string): NewDevice => ({
  kind: 'breaker',
  width: 1,
  props: { rating, curve: 'C', poles: '1P+N', label },
});

export function createExampleProject(): Project {
  const p = createProject('Maison — Tableau principal', 2, 13);
  p.meta.description = 'Exemple de tableau de répartition 2 rangées';
  const [r1, r2] = p.rows;
  r1.name = 'Rangée 1';
  r2.name = 'Rangée 2';
  const row1: NewDevice[] = [
    rcd(63, 'A', 'ID 63A type A'),
    cb(32, 'Plaque de cuisson'),
    cb(20, 'Four'),
    cb(10, 'Éclairage séjour'),
    cb(10, 'Éclairage chambres'),
    cb(16, 'Prises séjour'),
    cb(16, 'Prises chambres'),
    cb(10, 'Éclairage extérieur'),
    cb(16, 'Prises cuisine'),
    cb(20, 'Lave-vaisselle'),
    cb(2, 'VMC'),
    { kind: 'fuse', width: 1, props: { rating: 20, poles: '1P+N', label: 'Chauffe-eau' } },
  ];
  const row2: NewDevice[] = [
    rcd(63, 'AC', 'ID 63A type AC'),
    cb(20, 'Lave-linge'),
    cb(20, 'Sèche-linge'),
    cb(2, 'Sonnette'),
    cb(20, 'Congélateur'),
    cb(10, 'Éclairage SdB'),
    cb(10, 'Éclairage garage'),
    cb(20, 'Prises garage'),
    cb(16, 'Prises SdB'),
    { kind: 'blank', width: 0.5, props: {} },
    { kind: 'outlet', width: 2.5, props: { rating: 16, label: 'Prise tableau' } },
  ];
  for (const d of row1) addDevice(p, r1.id, d);
  for (const d of row2) addDevice(p, r2.id, d);
  return p;
}
