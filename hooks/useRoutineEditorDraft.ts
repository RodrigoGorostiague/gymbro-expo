import { useCallback, useEffect, useRef, useState } from 'react';
import { RoutineEditorDraft } from '../utils/routineEditor';
import {
  readRoutineDraft,
  writeRoutineDraft,
} from '../services/routineEditorDraft';

/** Mount this hook in an editor keyed by owner and sourceId. Context refreshes never reinitialize it. */
export function useRoutineEditorDraft(
  owner: string,
  sourceId: string,
  initial: () => RoutineEditorDraft | null,
) {
  const [draft, setDraft] = useState<RoutineEditorDraft | null>(null);
  const [status, setStatus] = useState<
    'loading' | 'writing' | 'saved' | 'error'
  >('loading');
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const current = useRef<RoutineEditorDraft | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const hydration = useRef(0);
  const seed = useRef(initial);
  seed.current = initial;
  const persist = useCallback((next: RoutineEditorDraft) => {
    const writing = ++revision.current;
    setStatus('writing');
    setError(null);
    return writeRoutineDraft(next).then(
      () => {
        if (mounted.current && writing === revision.current) setStatus('saved');
      },
      (failure: unknown) => {
        if (mounted.current && writing === revision.current) {
          setStatus('error');
          setError(
            failure instanceof Error
              ? failure.message
              : 'No se pudo guardar el borrador en este dispositivo.',
          );
        }
        throw failure;
      },
    );
  }, []);
  const hydrate = useCallback(async () => {
    const request = ++hydration.current;
    setStatus('loading');
    setError(null);
    try {
      const saved = await readRoutineDraft(owner, sourceId);
      if (!mounted.current || request !== hydration.current) return;
      const next = saved ?? seed.current();
      if (!next) {
        setStatus('error');
        setError(
          'La rutina no está disponible. Reintenta cuando termine de cargar tu biblioteca.',
        );
        return;
      }
      current.current = next;
      setDraft(next);
      setRestored(!!saved);
      await persist(next);
    } catch (failure) {
      if (mounted.current && request === hydration.current) {
        setStatus('error');
        setError(
          failure instanceof Error
            ? failure.message
            : 'No se pudo recuperar el borrador.',
        );
      }
    }
  }, [owner, sourceId, persist]);
  useEffect(() => {
    mounted.current = true;
    void hydrate();
    return () => {
      mounted.current = false;
      hydration.current++;
    };
  }, [hydrate]);
  const change = useCallback(
    (edit: (value: RoutineEditorDraft) => RoutineEditorDraft) => {
      if (!current.current) return;
      const next = edit(current.current);
      current.current = next;
      setDraft(next);
      void persist(next).catch(() => undefined);
    },
    [persist],
  );
  return {
    draft,
    status,
    error,
    restored,
    change,
    retry: () =>
      current.current
        ? persist(current.current).catch(() => undefined)
        : hydrate(),
    flush: () =>
      current.current ? persist(current.current) : Promise.resolve(),
  };
}
