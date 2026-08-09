import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { Platform } from 'react-native';
import { render } from './helpers/runtimeHarness';
import { DraggableList } from '../components/DraggableList';

describe('DraggableList adapter', () => {
  afterEach(() => { Platform.OS = 'ios'; });
  test('does not forward Reanimated-incompatible layout animation props', () => {
    const screen = render(React.createElement(DraggableList, { items: [{ id: 'press' }], labelForItem: (item) => item.id, onReorder: vi.fn(), children: () => React.createElement('Content') }));
    const list = screen.root.find((node) => (node.type as any) === 'DraggableFlatList');

    expect(list.props).not.toHaveProperty('enableLayoutAnimationExperimental');
    expect(list.props).not.toHaveProperty('itemLayoutAnimation');
  });

  test('starts from the accessible handle and persists official drag results', () => {
    const onReorder = vi.fn();
    const screen = render(React.createElement(DraggableList, { items: [{ id: 'press' }, { id: 'row' }], labelForItem: (item) => item.id, onReorder, children: () => React.createElement('Content') }));
    const list = screen.root.find((node) => (node.type as any) === 'DraggableFlatList');
    list.props.onDragEnd({ from: 0, to: 1 });
    expect(onReorder).toHaveBeenCalledWith(0, 1);
    expect(screen.root.find((node) => node.props.accessibilityLabel === 'Reordenar press').props.accessibilityHint).toContain('arrastrá');
  });

  test('uses a caller-provided placeholder while retaining the accessible fallback', () => {
    const items = [{ id: 'press' }];
    const fallback = render(React.createElement(DraggableList, { items, labelForItem: (item) => item.id, onReorder: vi.fn(), children: () => React.createElement('Content') }));
    const fallbackPlaceholder = fallback.root.find((node) => (node.type as any) === 'DraggableFlatList').props.renderPlaceholder({ item: items[0], index: 0 });
    expect(fallbackPlaceholder.props.pointerEvents).toBe('none');
    expect(fallbackPlaceholder.props.accessibilityLabel).toBe('Posición temporal press');

    const custom = render(React.createElement(DraggableList, { items, labelForItem: (item) => item.id, onReorder: vi.fn(), children: () => React.createElement('Content'), renderPlaceholder: () => React.createElement('ExerciseCardSkeleton') }));
    const customPlaceholder = custom.root.find((node) => (node.type as any) === 'DraggableFlatList').props.renderPlaceholder({ item: items[0], index: 0 });
    expect(customPlaceholder.type).toBe('ExerciseCardSkeleton');
  });

  test('uses a native FlatList when drag is disabled for a screen-level fallback', () => {
    const screen = render(React.createElement(DraggableList, { items: [{ id: 'press' }], labelForItem: (item) => item.id, onReorder: vi.fn(), dragEnabled: false, children: () => React.createElement('Content') }));

    expect(screen.root.findAll((node) => (node.type as any) === 'DraggableFlatList')).toHaveLength(0);
    expect(screen.root.find((node) => (node.type as any) === 'FlatList')).toBeTruthy();
  });

  test('uses the safe FlatList path on Android even when dragging is requested', () => {
    Platform.OS = 'android';
    const screen = render(React.createElement(DraggableList, { items: [{ id: 'press' }], labelForItem: (item) => item.id, onReorder: vi.fn(), children: () => React.createElement('Content') }));

    expect(screen.root.findAll((node) => (node.type as any) === 'DraggableFlatList')).toHaveLength(0);
    expect(screen.root.find((node) => (node.type as any) === 'FlatList')).toBeTruthy();
  });
});
