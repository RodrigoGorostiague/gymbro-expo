import React from 'react';
import { act } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { render } from './helpers/runtimeHarness';
import { PhotoComparison } from '../components/body/PhotoComparison';
import { BodyPhoto } from '../utils/bodyEvolution';
describe('accessible photo comparison', () => {
  it('exposes non-drag adjustment and preserves both photo sources', () => {
    const photos: [BodyPhoto, BodyPhoto] = [{ id: 'new', pose: 'back', day: '2026-09-17', capturedAt: '', uri: 'file://new.jpg' }, { id: 'old', pose: 'back', day: '2026-09-10', capturedAt: '', uri: 'file://old.jpg' }];
    const view = render(React.createElement(PhotoComparison, { photos, onClose: () => {} }));
    const divider = () => view.root.findAll(n => n.props.accessibilityRole === 'adjustable' && String(n.type) === 'View')[0];
    expect(divider().props.accessibilityValue.now).toBe(50);
    act(() => divider().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(divider().props.accessibilityValue.now).toBe(60);
    expect(view.root.findAll(n => String(n.type) === 'Image').map(n => n.props.source.uri)).toEqual(['file://new.jpg', 'file://old.jpg']);
  });
});
