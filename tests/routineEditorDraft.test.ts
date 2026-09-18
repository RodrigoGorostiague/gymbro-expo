import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, expect, test, vi } from 'vitest';
import { Routine } from '../types';
import { seedRoutineDraft } from '../utils/routineEditor';
import { useRoutineEditorDraft } from '../hooks/useRoutineEditorDraft';
import {
  readRoutineDraft,
  writeRoutineDraft,
  removeRoutineDraft,
  routineDraftKey,
} from '../services/routineEditorDraft';
const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: storage,
}));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const routine: Routine = {
  id: 'routine',
  name: 'Saved',
  muscleGroups: [],
  exercises: [],
  createdAt: '',
};
const seed = (owner = 'one', name = 'Saved') =>
  seedRoutineDraft(
    owner,
    'routine',
    { ...routine, name },
    'operation',
    routine,
  );
beforeEach(() => {
  storage.values.clear();
  vi.clearAllMocks();
});

test('context refresh never reinitializes edits and remount restores raw inputs', async () => {
  let value!: ReturnType<typeof useRoutineEditorDraft>;
  const Probe = ({ name = 'Saved' }: { name?: string }) => {
    value = useRoutineEditorDraft('one', 'routine', () => seed('one', name));
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  await act(async () =>
    value.change((current) => ({
      ...current,
      routine: { ...current.routine, name: 'Draft' },
      inputs: { set: { weight: '22,', reps: '' } },
    })),
  );
  await act(async () =>
    renderer.update(React.createElement(Probe, { name: 'Remote changed' })),
  );
  expect(value.draft?.routine.name).toBe('Draft');
  await act(async () => renderer.unmount());
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  expect(value.restored).toBe(true);
  expect(value.draft?.inputs.set.weight).toBe('22,');
  expect(value.draft?.routine.name).toBe('Draft');
  await act(async () => renderer.unmount());
});

test('serializes edits, removal and hydration while isolating account keys', async () => {
  let release!: () => void;
  storage.setItem.mockImplementationOnce(async (key, value) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    storage.values.set(key, value);
  });
  const first = writeRoutineDraft(seed('one', 'First'));
  await Promise.resolve();
  await Promise.resolve();
  const second = writeRoutineDraft(seed('one', 'Latest'));
  const other = writeRoutineDraft(seed('two', 'Other account'));
  await other;
  release();
  await first;
  await second;
  expect((await readRoutineDraft('one', 'routine'))?.routine.name).toBe(
    'Latest',
  );
  expect((await readRoutineDraft('two', 'routine'))?.routine.name).toBe(
    'Other account',
  );
  const pending = writeRoutineDraft(seed('one', 'Pending'));
  const removal = removeRoutineDraft('one', 'routine');
  await pending;
  await removal;
  expect(await readRoutineDraft('one', 'routine')).toBeNull();
});

test('reports storage failure honestly and retries the latest in-memory state', async () => {
  let value!: ReturnType<typeof useRoutineEditorDraft>;
  const Probe = () => {
    value = useRoutineEditorDraft('one', 'routine', () => seed());
    return null;
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  storage.setItem.mockRejectedValueOnce(new Error('Disk full'));
  await act(async () =>
    value.change((current) => ({
      ...current,
      routine: { ...current.routine, name: 'Latest' },
    })),
  );
  expect(value.status).toBe('error');
  expect(value.error).toBe('Disk full');
  expect(value.draft?.routine.name).toBe('Latest');
  await act(async () => {
    await value.retry();
  });
  expect(value.status).toBe('saved');
  expect((await readRoutineDraft('one', 'routine'))?.routine.name).toBe(
    'Latest',
  );
  await act(async () => renderer.unmount());
});

test('corrupt draft is retained for recovery rather than silently replaced', async () => {
  storage.values.set(routineDraftKey('one', 'routine'), '{broken');
  await expect(readRoutineDraft('one', 'routine')).rejects.toThrow();
  expect(storage.values.get(routineDraftKey('one', 'routine'))).toBe('{broken');
});
