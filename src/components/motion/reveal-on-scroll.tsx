'use client';

import { useEffect } from 'react';

/**
 * Marks each [data-reveal] block as shown the first time it scrolls into
 * view, and never again: the page animates in once and then stays put. The
 * hidden states live in globals.css under html.js, so if this never runs,
 * nothing is hidden.
 */
export function RevealOnScroll() {
  useEffect(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not([data-shown])')];
    if (!('IntersectionObserver' in window)) {
      blocks.forEach((block) => block.setAttribute('data-shown', ''));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute('data-shown', '');
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    blocks.forEach((block) => observer.observe(block));
    return () => observer.disconnect();
  }, []);
  return null;
}
