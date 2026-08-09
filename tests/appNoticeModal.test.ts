import React from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from './helpers/runtimeHarness';
import { AppNoticeModal } from '../components/AppNoticeModal';

describe('AppNoticeModal', () => {
  test('renders a reusable reward notice and dismisses it from its action', () => {
    const onClose = vi.fn();
    const notice = render(React.createElement(AppNoticeModal, {
      visible: true,
      title: 'Reward title',
      message: 'Reward message',
      changes: ['First change', 'Second change'],
      highlight: '+250 GEMS',
      actionLabel: 'Claim',
      onClose,
    }));

    expect(notice.root.findByProps({ accessibilityRole: 'alert' })).toBeTruthy();
    expect(JSON.stringify(notice.toJSON())).toContain('First change');
    expect(JSON.stringify(notice.toJSON())).toContain('Second change');
    notice.root.findByProps({ accessibilityLabel: 'Claim' }).props.onPress();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
