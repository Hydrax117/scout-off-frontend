/**
 * @jest-environment node
 */
import { NotificationPreferencesStore } from '@/lib/notificationPreferencesStore';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/lib/notificationPreferencesClient';

let store: NotificationPreferencesStore;

beforeEach(() => {
  NotificationPreferencesStore.resetInstance();
  store = NotificationPreferencesStore.getInstance();
});

afterEach(() => {
  NotificationPreferencesStore.resetInstance();
});

describe('NotificationPreferencesStore', () => {
  it('is a singleton', () => {
    const a = NotificationPreferencesStore.getInstance();
    const b = NotificationPreferencesStore.getInstance();
    expect(a).toBe(b);
  });

  it('get returns the default preferences when no row exists for the wallet', () => {
    expect(store.get('GWALLET')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('set persists preferences and get returns them back', () => {
    const result = store.set('GWALLET', {
      milestoneApprovals: false,
      contactUnlocks: true,
    });

    expect(result).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(store.get('GWALLET')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
  });

  it('set both categories off is persisted correctly', () => {
    store.set('GWALLET', { milestoneApprovals: false, contactUnlocks: false });

    expect(store.get('GWALLET')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: false,
    });
  });

  it('set upserts on repeated calls for the same wallet (no duplicate rows)', () => {
    store.set('GWALLET', { milestoneApprovals: false, contactUnlocks: false });
    store.set('GWALLET', { milestoneApprovals: true, contactUnlocks: false });

    expect(store.get('GWALLET')).toEqual({
      milestoneApprovals: true,
      contactUnlocks: false,
    });
  });

  it('scopes preferences per wallet', () => {
    store.set('GWALLET_A', {
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    store.set('GWALLET_B', {
      milestoneApprovals: true,
      contactUnlocks: false,
    });

    expect(store.get('GWALLET_A')).toEqual({
      milestoneApprovals: false,
      contactUnlocks: true,
    });
    expect(store.get('GWALLET_B')).toEqual({
      milestoneApprovals: true,
      contactUnlocks: false,
    });
  });
});
