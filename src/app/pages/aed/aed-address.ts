import { suggestTeryt } from './aed.logic';

/** One hit from the state register (GUGiK, Państwowy Rejestr Granic). */
export interface RegistryAddress {
  kind: 'miejscowosc' | 'ulica' | 'adres';
  miejscowosc: string;
  ulica: string;
  numer_budynku: string;
  kod_pocztowy: string;
  /** TERC as returned by the register, usually 6 digits, without the gmina kind digit. */
  teryt: string;
  simc: string;
  ulic: string;
  szerokosc_geograficzna: number;
  dlugosc_geograficzna: number;
  accuracy: number;
  label: string;
}

export interface SuggestionPlan {
  step: 'city' | 'street' | 'number';
  city: string;
  street: string;
  number: string;
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

/** "Bydgoszcz" → cities, "Bydgoszcz, Dłu" → streets, "Bydgoszcz, Długa 12" → house numbers. */
export function suggestionPlan(query: string): SuggestionPlan | null {
  const text = query.trim();
  const comma = text.indexOf(',');
  if (comma < 0) return text.length >= 3 ? { step: 'city', city: text, street: '', number: '' } : null;
  const city = text.slice(0, comma).trim();
  const rest = text.slice(comma + 1).trim();
  if (city.length < 3 || rest.length < 2) return null;
  const house = rest.match(/^(.*\D)\s+(\d+\S*)$/);
  if (house && house[1].trim().length >= 2) return { step: 'number', city, street: house[1].trim(), number: house[2] };
  return { step: 'street', city, street: rest, number: '' };
}

export async function suggestRegistry(query: string): Promise<RegistryAddress[]> {
  const plan = suggestionPlan(query);
  if (!plan) return [];
  if (plan.step === 'city') return (await fetchList('miejscowosc', { request: 'GetCity', city: plan.city })).slice(0, 8);
  const streets = await fetchList('ulica', { request: 'GetStreet', city: plan.city, street: plan.street });
  if (plan.step === 'street') {
    const exact = streets.filter(hit => streetName(hit.ulica) === streetName(plan.street));
    if (exact.length === 1 && exact[0].simc) return (await fetchNumbers(exact[0])).slice(0, 12);
    return streets.slice(0, 8);
  }
  const exact = streets.filter(hit => streetName(hit.ulica) === streetName(plan.street));
  const street = exact.length === 1 ? exact[0] : streets.length === 1 ? streets[0] : null;
  if (!street?.simc || !street.ulic) return streets.slice(0, 8);
  const prefix = plan.number.toLocaleLowerCase('pl');
  return (await fetchNumbers(street)).filter(hit => hit.numer_budynku.toLocaleLowerCase('pl').startsWith(prefix)).slice(0, 8);
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

interface RawHit { city?: string; street?: string; number?: string; code?: string; teryt?: string; simc?: string; ulic?: string; voivodeship?: string; x?: string; y?: string; accuracy?: string; }

async function fetchList(kind: RegistryAddress['kind'], params: Record<string, string>): Promise<RegistryAddress[]> {
  const query = new URLSearchParams({ ...params, srid: '4326' });
  return parseResults(await fetchJson(`${UUG}?${query}`)).map(hit => ({ ...hit, kind }));
}

async function fetchNumbers(street: RegistryAddress): Promise<RegistryAddress[]> {
  const hits = await fetchList('adres', { request: 'GetAddresses', simc: street.simc, ulic: street.ulic });
  return hits.sort((a, b) => houseOrder(a.numer_budynku) - houseOrder(b.numer_budynku) || a.numer_budynku.localeCompare(b.numer_budynku, 'pl'));
}

function houseOrder(value: string): number {
  const digits = value.match(/^(\d+)/);
  return digits ? Number(digits[1]) : 99999;
}

function parseHit(raw: RawHit): RegistryAddress | null {
  const lat = Number(raw.y);
  const lon = Number(raw.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const miejscowosc = raw.city?.trim() || '';
  const ulica = raw.street?.trim() || '';
  const numer = raw.number?.trim() || '';
  const kod = raw.code?.trim() || '';
  const region = raw.voivodeship?.trim();
  const place = region && !ulica ? `${miejscowosc}, ${region}` : miejscowosc;
  const label = [[ulica, numer].filter(Boolean).join(' '), kod, place].filter(Boolean).join(', ');
  return {
    kind: numer ? 'adres' : ulica ? 'ulica' : 'miejscowosc',
    miejscowosc, ulica, numer_budynku: numer, kod_pocztowy: kod, teryt: raw.teryt?.trim() || '',
    simc: raw.simc?.trim() || '', ulic: raw.ulic?.trim() || '',
    szerokosc_geograficzna: lat, dlugosc_geograficzna: lon, accuracy: Number(raw.accuracy) || 0, label: label || 'Punkt adresowy',
  };
}
