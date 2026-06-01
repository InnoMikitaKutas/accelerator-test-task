import reducer, { pushToast, dismissToast, clearToasts } from './toastsSlice';

describe('toastsSlice', () => {
  it('pushes a toast with a generated id', () => {
    const s = reducer(undefined, pushToast({ tone: 'go', message: 'Saved' }));
    expect(s.items).toHaveLength(1);
    expect(s.items[0].id).toBeTruthy();
    expect(s.items[0]).toMatchObject({ tone: 'go', message: 'Saved' });
  });

  it('dismisses a toast by id', () => {
    const pushed = reducer(undefined, pushToast({ tone: 'foul', message: 'Boom' }));
    const id = pushed.items[0].id;
    const s = reducer(pushed, dismissToast(id));
    expect(s.items).toHaveLength(0);
  });

  it('clears all toasts', () => {
    let s = reducer(undefined, pushToast({ tone: 'info', message: 'a' }));
    s = reducer(s, pushToast({ tone: 'info', message: 'b' }));
    expect(reducer(s, clearToasts()).items).toHaveLength(0);
  });
});
