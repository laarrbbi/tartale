/**
 * The cake photos that ship with the site, under public/cakes/. The panel
 * offers these to pick from; a new one is a file there and a line here
 * (tests/rules.test.ts checks the two agree).
 */
export const CAKE_PHOTOS = [
  { path: '/cakes/chocolate.jpg', label: 'Chocolate' },
  { path: '/cakes/cheesecake.jpg', label: 'Cheesecake' },
  { path: '/cakes/red-velvet.jpg', label: 'Red Velvet' },
  { path: '/cakes/carrot-cake.jpg', label: 'Carrot cake' },
  { path: '/cakes/limon-arandanos.jpg', label: 'Limón y arándanos' },
  { path: '/cakes/lotus.jpg', label: 'Lotus' },
  { path: '/cakes/kinder.jpg', label: 'Kinder' },
] as const;

export type CakePhoto = (typeof CAKE_PHOTOS)[number]['path'];
export const CAKE_PHOTO_PATHS: readonly string[] = CAKE_PHOTOS.map((p) => p.path);
