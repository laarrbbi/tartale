'use client';

import { useEffect, useRef } from 'react';

/**
 * The film behind the hero: an executive on a bad call in his office; the
 * courier smiles at his door and holds out a Tartame box; he looks down at
 * it, the cake says «Contáctame, tengo una propuesta» and a number; he picks
 * up his phone and dials it. Muted, looped, 14 seconds at 1920x1080: about
 * 2 MB as WebM (what most browsers take) or 4 MB as MP4.
 *
 * It plays only while it is on screen, and not at all for people who asked
 * for less motion or to save data: they get a still of the cake instead.
 * While it plays it marks the scene on screen as `data-scene` on the closest
 * `[data-film]` element, so the captions around it can follow the story.
 */
export function HeroFilm({ className, scenes = [] }: { className?: string; scenes?: readonly number[] }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (saveData || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.poster = '/video/hero-still.jpg';
      return;
    }
    video.muted = true;
    const film = video.closest<HTMLElement>('[data-film]');
    const onTime = () => {
      if (!film || scenes.length === 0) return;
      let scene = 0;
      for (let i = 0; i < scenes.length; i++) if (video.currentTime >= scenes[i]!) scene = i;
      if (film.dataset.scene !== String(scene)) film.dataset.scene = String(scene);
    };
    video.addEventListener('timeupdate', onTime);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.removeEventListener('timeupdate', onTime);
    };
  }, [scenes]);

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
