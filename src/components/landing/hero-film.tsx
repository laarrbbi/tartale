'use client';

import { useEffect, useRef } from 'react';

/**
 * The film behind the hero, in three shots: a man in a suit having a bad call
 * in his office; the cake that arrives, «Contáctame, tengo una propuesta» and
 * a number printed on it; the same man laughing on the phone. It plays only
 * while it is on screen, and not at all for people who asked for less motion
 * or to save data: they get the still. Muted, looped, 11 seconds, about
 * 440 KB (WebM) or 640 KB (MP4).
 */
export function HeroFilm({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    video.muted = true;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      muted
      loop
      playsInline
      preload="metadata"
      poster="/video/hero-poster.jpg"
      aria-hidden
      tabIndex={-1}
      disablePictureInPicture
    >
      <source src="/video/hero.webm" type="video/webm" />
      <source src="/video/hero.mp4" type="video/mp4" />
    </video>
  );
}
