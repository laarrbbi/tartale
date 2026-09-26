import 'server-only';

import { fromPrice, type SizePrices } from '@/lib/orders';
import { listBakeries, listCakes, listZones, type SizeNotes } from '@/server/repositories/catalog';

/**
 * What the public pages may know about the catalog: cities, postcodes,
 * delivery prices, and each bakery's menu. Plain, serialisable objects — they
 * are handed to client components as props.
 */
export interface PublicZone {
  id: number;
  name: string;
  city: string;
  postalCodes: string[];
  deliveryCents: number;
}

export interface PublicCake {
  id: number;
  name: string;
  description: string | null;
  photo: string | null;
  prices: SizePrices;
}

export interface PublicMenu {
  city: string;
  bakery: { id: number; name: string; printsPhotos: boolean; sizeNotes: SizeNotes };
  zones: PublicZone[];
  cakes: PublicCake[];
}

export interface PublicCity {
  city: string;
  postalCodes: string[];
  /** The delivery prices in this city, lowest first (one value when there is one zone). */
  deliveryCents: number[];
}

/**
 * One menu per city: the bakery that delivers there and its cakes. Today a
 * city has one bakery; when a city gets a second one, the order form will
 * need the postcode before the cake (see docs/roadmap.md).
 */
export async function publicMenus(): Promise<PublicMenu[]> {
  const [bakeries, zones, cakes] = await Promise.all([listBakeries(), listZones(), listCakes({ activeOnly: true })]);
  const menus: PublicMenu[] = [];
  for (const bakery of bakeries.filter((b) => b.active)) {
    const bakeryZones = zones.filter((z) => z.active && z.bakeryId === bakery.id && z.postalCodes.length > 0);
    const bakeryCakes = cakes.filter((c) => c.bakeryId === bakery.id && fromPrice(c.prices) !== null);
    if (bakeryZones.length === 0 || bakeryCakes.length === 0) continue;
    for (const city of [...new Set(bakeryZones.map((z) => z.city))]) {
      if (menus.some((m) => m.city === city)) continue;
      menus.push({
        city,
        bakery: { id: bakery.id, name: bakery.name, printsPhotos: bakery.printsPhotos, sizeNotes: bakery.sizeNotes },
        zones: bakeryZones
          .filter((z) => z.city === city)
          .map((z) => ({ id: z.id, name: z.name, city: z.city, postalCodes: z.postalCodes, deliveryCents: z.deliveryCents })),
        cakes: bakeryCakes.map((c) => ({ id: c.id, name: c.name, description: c.description, photo: c.photo, prices: c.prices })),
      });
    }
  }
  return menus;
}

export function citiesOf(menus: PublicMenu[]): PublicCity[] {
  return menus.map((m) => ({
    city: m.city,
    postalCodes: [...new Set(m.zones.flatMap((z) => z.postalCodes))].sort(),
    deliveryCents: [...new Set(m.zones.map((z) => z.deliveryCents))].sort((a, b) => a - b),
  }));
}
