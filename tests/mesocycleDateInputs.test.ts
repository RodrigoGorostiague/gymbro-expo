import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { formatPickerDate, parsePickerDate } from '../utils/datePicker';

describe('mesocycle date inputs', () => {
  test('round-trips picker dates through the ISO helper', () => {
    const parsed = parsePickerDate('2026-07-28');

    expect(formatPickerDate(parsed)).toBe('2026-07-28');
  });

  test('uses picker-backed start date controls on create and edit screens', () => {
    const createSource = readFileSync(new URL('../app/mesocycle/create.tsx', import.meta.url), 'utf8');
    const editSource = readFileSync(new URL('../app/mesocycle/[id].tsx', import.meta.url), 'utf8');

    expect(createSource).toContain('DateTimeField');
    expect(createSource).toContain('testID="mesocycle-create-start-date-picker"');
    expect(createSource).not.toContain('placeholder="YYYY-MM-DD"');

    expect(editSource).toContain('DateTimeField');
    expect(editSource).toContain('testID="mesocycle-edit-start-date-picker"');
    expect(editSource).not.toContain('onChangeText={setStartDate}');
  });
});
