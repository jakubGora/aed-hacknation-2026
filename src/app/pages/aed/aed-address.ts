import { suggestTeryt } from './aed.logic';

/** One address point from the state register (GUGiK, Państwowy Rejestr Granic). */
export interface RegistryAddress {
  miejscowosc: string;
  ulica: string;
  numer_budynku: string;
  kod_pocztowy: string;
  /** TERC as returned by the register, usually 6 digits, without the gmina kind digit. */
  teryt: string;
  szerokosc_geograficzna: number;
  dlugosc_geograficzna: number;
  accuracy: number;
  label: string;
}

const UUG = 'https://services.gugik.gov.pl/uug/';

/** "Bydgoszcz, Długa 12" — the phrasing the register matches. A leading "ul." makes it miss. */
export function registryQuery(d: { miejscowosc: string; ulica: string; numer_budynku: string }): string {
  const street = d.ulica.trim().replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/i, '');
  const place = [street, d.numer_budynku.trim()].filter(Boolean).join(' ');
  return [d.miejscowosc.trim(), place].filter(Boolean).join(', ');
}

/** The register omits the 7th TERYT digit. Use it only when the full gmina code is known. */
export function terytFromRegistry(miejscowosc: string, code: string): string {
  const known = suggestTeryt(miejscowosc);
  if (known && code && known.startsWith(code)) return known;
  return /^\d{7}$/.test(code) ? code : '';
}

const fold = (s: string) => s.trim().toLocaleLowerCase('pl').replace(/\s+/g, ' ');
const streetName = (s: string) => fold(s).replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/, '');

export function addressesMatch(typed: { miejscowosc: string; ulica: string; numer_budynku: string }, hit: { miejscowosc: string; ulica: string; numer_budynku: string }): boolean {
  return fold(typed.miejscowosc) === fold(hit.miejscowosc) && streetName(typed.ulica) === streetName(hit.ulica) && fold(typed.numer_budynku) === fold(hit.numer_budynku);
}

export async function searchRegistry(address: string): Promise<RegistryAddress[]> {
  const url = `${UUG}?request=GetAddress&srid=4326&limit=8&address=${encodeURIComponent(address)}`;
  return parseResults(await fetchJson(url));
}

export async function reverseRegistry(lat: number, lon: number): Promise<RegistryAddress | null> {
  const url = `${UUG}?request=GetAddressReverse&srid=4326&location=${encodeURIComponent(`POINT(${lon} ${lat})`)}`;
  return parseResults(await fetchJson(url))[0] ?? null;
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } catch {
    throw new Error('Nie udało się połączyć z rejestrem adresów. Wskaż punkt na mapie albo wpisz współrzędne ręcznie.');
  } finally {
    clearTimeout(timer);
  }
}

function parseResults(body: unknown): RegistryAddress[] {
  const results = (body as { results?: Record<string, RawHit> } | null)?.results;
  if (!results) return [];
  return Object.values(results).map(parseHit).filter((hit): hit is RegistryAddress => !!hit);
}

interface RawHit { city?: string; street?: string; number?: string; code?: string; teryt?: string; x?: string; y?: string; accuracy?: string; }

function parseHit(raw: RawHit): RegistryAddress | null {
  const lat = Number(raw.y);
  const lon = Number(raw.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const miejscowosc = raw.city?.trim() || '';
  const ulica = raw.street?.trim() || '';
  const numer = raw.number?.trim() || '';
  const kod = raw.code?.trim() || '';
  const label = [[ulica, numer].filter(Boolean).join(' '), kod, miejscowosc].filter(Boolean).join(', ');
  return {
    miejscowosc, ulica, numer_budynku: numer, kod_pocztowy: kod, teryt: raw.teryt?.trim() || '',
    szerokosc_geograficzna: lat, dlugosc_geograficzna: lon, accuracy: Number(raw.accuracy) || 0, label: label || 'Punkt adresowy',
  };
}
