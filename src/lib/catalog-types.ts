import type { CakeSize, SizePrices } from './orders';

/**
 * What the public pages may know about the catalog, as plain serialisable
 * objects: they are handed to client components as props.
 */
export type SizeNotes = Partial<Record<CakeSize, string>>;

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
