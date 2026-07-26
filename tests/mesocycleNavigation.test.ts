import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (relativePath: string) =>
  readFileSync(resolve(import.meta.dirname, '..', relativePath), 'utf8');

describe('mesocycle navigation contract', () => {
  test('registers dedicated mesocycle tab and stack routes', () => {
    const tabsLayout = readSource('app/(tabs)/_layout.tsx');
    const rootLayout = readSource('app/_layout.tsx');

    expect(tabsLayout).toContain('name="mesocycles/index"');
    expect(rootLayout).toContain('name="mesocycle/create"');
    expect(rootLayout).toContain('name="mesocycle/[id]"');
  });

  test('keeps an invalid-id fallback boundary and real detail editor', () => {
    const detailScreen = readSource('app/mesocycle/[id].tsx');

    expect(detailScreen).toContain('No encontramos este mesociclo');
    expect(detailScreen).toContain('Volver a mesociclos');
    expect(detailScreen).toContain('Resumen del mesociclo');
    expect(detailScreen).toContain('Agregar sesión');
    expect(detailScreen).toContain('Guardar planificación');
  });

  test('keeps unresolved planned sessions visible while suppressing execute navigation', () => {
    const detailScreen = readSource('app/mesocycle/[id].tsx');

    expect(detailScreen).toContain('Rutina no disponible');
    expect(detailScreen).toContain('Esta referencia sigue visible para que puedas reasignarla sin perder la planificación.');
    expect(detailScreen).toContain('if (!resolvedRoutine) return;');
    expect(detailScreen).toContain('router.push(`/routine/execute/${resolvedRoutine.id}`)');
  });

  test('preserves routine library terminology when mesocycles are present', () => {
    const routinesScreen = readSource('app/(tabs)/routines/index.tsx');

    expect(routinesScreen).toContain('Biblioteca de rutinas');
    expect(routinesScreen).toContain('Plantillas reutilizables para mesociclos y entrenamientos');
  });
});
