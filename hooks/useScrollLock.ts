import { useEffect, useRef } from 'react';

export function useScrollLock() {
  const scrollY = useRef(0);
  const isLocked = useRef(false);

  const lockScroll = () => {
    if (isLocked.current) return;
    
    scrollY.current = window.pageYOffset || document.documentElement.scrollTop;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY.current}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    isLocked.current = true;
  };

  const unlockScroll = () => {
    if (!isLocked.current) return;
    
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, scrollY.current);
    isLocked.current = false;
  };

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      unlockScroll();
    };
  }, []);

  return { lockScroll, unlockScroll };
}