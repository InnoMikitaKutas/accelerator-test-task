import reducer, {
  setContext,
  clearContext,
  hydrateContext,
  markContextSynced,
} from './activeContextSlice';
import type { ContextRef } from '@/types/api';

const ref: ContextRef = { subjectProfileId: 'sub-1', trainerId: 'tr-9' };
const KEY = 'activeContext';

describe('activeContextSlice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('starts with no context', () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ current: null, dirty: false });
  });

  it('setContext stores the ref, marks dirty, and persists to localStorage', () => {
    const s = reducer(undefined, setContext(ref));
    expect(s.current).toEqual(ref);
    expect(s.dirty).toBe(true);
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(ref);
  });

  it('hydrateContext reads the persisted ref with dirty=false', () => {
    localStorage.setItem(KEY, JSON.stringify(ref));
    const s = reducer(undefined, hydrateContext());
    expect(s.current).toEqual(ref);
    expect(s.dirty).toBe(false);
  });

  it('hydrateContext ignores malformed storage', () => {
    localStorage.setItem(KEY, '{not json');
    expect(reducer(undefined, hydrateContext()).current).toBeNull();
  });

  it('clearContext nulls state and removes storage', () => {
    const seeded = reducer(undefined, setContext(ref));
    const s = reducer(seeded, clearContext());
    expect(s.current).toBeNull();
    expect(s.dirty).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('markContextSynced clears the dirty flag', () => {
    const dirty = reducer(undefined, setContext(ref));
    expect(reducer(dirty, markContextSynced()).dirty).toBe(false);
  });
});
