/**
 * Where the cities we might deliver in are, for the pins on the zones map
 * (latitude, longitude). A city that is not here still shows in the list; it
 * just has no pin until it is added.
 */
const CITIES: Record<string, [number, number]> = {
  alicante: [38.3452, -0.481],
  elche: [38.2699, -0.699],
  benidorm: [38.5411, -0.1225],
  murcia: [37.9922, -1.1307],
  valencia: [39.4699, -0.3763],
  castellon: [39.9864, -0.0513],
  madrid: [40.4168, -3.7038],
  barcelona: [41.3874, 2.1686],
  zaragoza: [41.6488, -0.8891],
  sevilla: [37.3891, -5.9845],
  malaga: [36.7213, -4.4214],
  granada: [37.1773, -3.5986],
  cordoba: [37.8882, -4.7794],
  bilbao: [43.263, -2.935],
  'san sebastian': [43.3183, -1.9812],
  santander: [43.4623, -3.81],
  pamplona: [42.8125, -1.6458],
  valladolid: [41.6523, -4.7245],
  oviedo: [43.3614, -5.8593],
  gijon: [43.5322, -5.6611],
  'a coruna': [43.3623, -8.4115],
  vigo: [42.2406, -8.7207],
  palma: [39.5696, 2.6502],
  'las palmas de gran canaria': [28.1235, -15.4363],
  'santa cruz de tenerife': [28.4636, -16.2518],
};

/** Other names people use for the same place. */
const ALIASES: Record<string, string> = {
  alacant: 'alicante',
  elx: 'elche',
  'castellon de la plana': 'castellon',
  donostia: 'san sebastian',
  'la coruna': 'a coruna',
  'palma de mallorca': 'palma',
  'las palmas': 'las palmas de gran canaria',
};

/** "Málaga " → "malaga": no accents, no case, single spaces. */
export function normalizePlace(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name we file a place under: "Alacant" and "Alicante" are the same city. */
export function canonicalPlace(name: string): string {
  const key = normalizePlace(name);
  return ALIASES[key] ?? key;
}

export function cityCoordinates(city: string): [number, number] | null {
  return CITIES[canonicalPlace(city)] ?? null;
}
