import { useEffect } from 'react';

/**
 * Reentrant scroll-lock for <body>.
 *
 * Multiple modals can be open at once (e.g. ConfirmModal opened on top of a
 * Modal). Each lock has historically captured `originalOverflow` at the moment
 * it ran — which means if Modal A locked, Modal B locked-on-top of A, and then
 * A unmounted before B, B's cleanup would restore A's "hidden" value and the
 * page would stay locked forever even after B closed too.
 *
 * Reference-counter pattern: only the *first* lock saves the original styles
 * and applies hidden+padding-right; only the *last* unlock restores them.
 * Intermediate lock/unlock pairs just bump the counter.
 *
 * Module-level state means every component sharing this module shares the same
 * counter — that's exactly what we want.
 */
let lockCount = 0;
let savedOverflow = '';
let savedPaddingRight = '';

const lock = () => {
  if (lockCount === 0) {
    savedOverflow = document.body.style.overflow;
    savedPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }
  lockCount += 1;
};

const unlock = () => {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.body.style.overflow = savedOverflow;
    document.body.style.paddingRight = savedPaddingRight;
  }
};

export const useScrollLock = (isLocked) => {
  useEffect(() => {
    if (!isLocked) return;
    lock();
    return unlock;
  }, [isLocked]);
};

// For tests / safety-net resets — exposed so the global "release everything"
// reset in App.jsx can synchronise the counter.
export const __resetScrollLockForTests = () => {
  lockCount = 0;
  savedOverflow = '';
  savedPaddingRight = '';
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
};
