import 'server-only';

import type { PublicCity, PublicMenu } from '@/lib/catalog-types';
import { fromPrice } from '@/lib/orders';
import { listBakeries, listCakes, listZones } from '@/server/repositories/catalog';

export type { PublicCake, PublicCity, PublicMenu, PublicZone } from '@/lib/catalog-types';

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
        bakery: { id: bakery.id, name: bakery.name, sizeNotes: bakery.sizeNotes },
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
