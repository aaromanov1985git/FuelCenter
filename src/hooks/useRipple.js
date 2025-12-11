import { useRef, useEffect } from 'react';

export const useRipple = () => {
  const rippleRef = useRef(null);

  useEffect(() => {
    const element = rippleRef.current;
    if (!element) return;

    const createRipple = (e) => {
      const ripple = document.createElement('span');
      const rect = element.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${x}px`;
      ripple.style.top = `${y}px`;
      ripple.classList.add('ripple-effect');
      ripple.style.position = 'absolute';
      ripple.style.borderRadius = '50%';
      ripple.style.background = 'rgba(255, 255, 255, 0.6)';
      ripple.style.transform = 'scale(0)';
      ripple.style.animation = 'ripple-animation 0.6s ease-out';
      ripple.style.pointerEvents = 'none';

      element.appendChild(ripple);

      setTimeout(() => ripple.remove(), 600);
    };

    element.addEventListener('click', createRipple);
    return () => element.removeEventListener('click', createRipple);
  }, []);

  return rippleRef;
};
