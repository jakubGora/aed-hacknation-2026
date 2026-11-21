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

/** One postal code when every hit agrees. Several codes for one street stay empty. */
export function singlePostcode(codes: string[]): string {
  const unique = [...new Set(codes.map(code => code.trim()).filter(code => /^\d{2}-\d{3}$/.test(code)))];
  return unique.length === 1 ? unique[0] : '';
}
const streetName = (s: string) => fold(s).replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/, '');

export function addressesMatch(typed: { miejscowosc: string; ulica: string; numer_budynku: string }, hit: { miejscowosc: string; ulica: string; numer_budynku: string }): boolean {
  return fold(typed.miejscowosc) === fold(hit.miejscowosc) && streetName(typed.ulica) === streetName(hit.ulica) && fold(typed.numer_budynku) === fold(hit.numer_budynku);
}

/** Query for the field the person is typing in. City, then street, then house number. */
export function fieldSuggestionQuery(field: 'miejscowosc' | 'ulica' | 'numer_budynku', d: { miejscowosc: string; ulica: string; numer_budynku: string }): string | null {
  const city = d.miejscowosc.trim();
  const street = d.ulica.trim().replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/i, '');
  const number = d.numer_budynku.trim();
  if (field === 'miejscowosc') return city.length >= 3 ? city : null;
  if (city.length < 3) return null;
  if (field === 'ulica') return street.length >= 2 ? `${city}, ${street}` : null;
  return street.length >= 2 && number.length >= 1 ? `${city}, ${street} ${number}` : null;
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

export async function suggestRegistry(query: string, near?: GeoPoint): Promise<RegistryAddress[]> {
  const plan = suggestionPlan(query);
  if (!plan) return [];
  if (plan.step === 'city') return suggestCities(plan.city);
  const streets = await fetchList('ulica', { request: 'GetStreet', city: plan.city, street: plan.street }).catch(() => [] as RegistryAddress[]);
  if (plan.step === 'street') {
    if (!streets.length) return photonStreets(plan.city, plan.street, near);
    const exact = streets.filter(hit => streetName(hit.ulica) === streetName(plan.street));
    if (exact.length === 1 && exact[0].simc) return (await fetchNumbers(exact[0])).slice(0, 12);
    return streets.slice(0, 8);
  }
  const exact = streets.filter(hit => streetName(hit.ulica) === streetName(plan.street));
  const street = exact.length === 1 ? exact[0] : streets.length === 1 ? streets[0] : null;
  const prefix = plan.number.toLocaleLowerCase('pl');
  if (street?.simc && street.ulic) {
    const numbers = (await fetchNumbers(street)).filter(hit => hit.numer_budynku.toLocaleLowerCase('pl').startsWith(prefix));
    if (numbers.length) return numbers.slice(0, 8);
  }
  if (streets.length) return streets.slice(0, 8);
  return photonHouses(plan.city, plan.street, plan.number, near);
}

export async function searchRegistry(address: string): Promise<RegistryAddress[]> {
  const url = `${UUG}?request=GetAddress&srid=4326&limit=8&address=${encodeURIComponent(address)}`;
  return parseResults(await fetchJson(url));
}

export async function reverseRegistry(lat: number, lon: number): Promise<RegistryAddress | null> {
  const url = `${UUG}?request=GetAddressReverse&srid=4326&location=${encodeURIComponent(`POINT(${lon} ${lat})`)}`;
  return parseResults(await fetchJson(url))[0] ?? null;
}

/** The address register matches a full city name. A prefix such as "Warsz" falls through to a settlement search, then the chosen name is resolved back in the register. */
async function suggestCities(city: string): Promise<RegistryAddress[]> {
  try {
    const hits = (await fetchList('miejscowosc', { request: 'GetCity', city })).slice(0, 8);
    if (hits.length) return hits;
  } catch { /* the register refused the fragment; the settlement search still completes the name */ }
  return photonCities(city);
}

async function photonCities(fragment: string): Promise<RegistryAddress[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(fragment)}&lang=default&limit=8&lat=52&lon=19`;
  let body: unknown;
  try { body = await fetchJson(url); } catch { return []; }
  const features = (body as { features?: PhotonFeature[] } | null)?.features;
  if (!features) return [];
  const seen = new Set<string>();
  const hits: RegistryAddress[] = [];
  for (const feature of features) {
    const hit = photonCity(feature);
    if (!hit) continue;
    const key = fold(hit.label);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(hit);
  }
  return hits;
}

interface GeoPoint { lat: number; lon: number; }

interface PhotonFeature { geometry?: { coordinates?: number[] }; properties?: { osm_key?: string; osm_value?: string; name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; locality?: string; district?: string; state?: string; countrycode?: string }; }

async function photonStreets(city: string, fragment: string, near?: GeoPoint): Promise<RegistryAddress[]> {
  const point = await cityPoint(city, near);
  const features = await photonSearch(fragment, 'street', point);
  const grouped = new Map<string, { name: string; lat: number; lon: number; codes: string[] }>();
  for (const feature of features) {
    const props = feature.properties || {};
    const name = props.name?.trim() || '';
    if (!samePlace(props.city || props.locality || '', city) || !name || !fold(name).startsWith(fold(fragment))) continue;
    const coords = photonCoords(feature);
    if (!coords) continue;
    const key = fold(name);
    const entry = grouped.get(key) ?? { name, lat: coords.lat, lon: coords.lon, codes: [] };
    if (props.postcode) entry.codes.push(props.postcode);
    grouped.set(key, entry);
  }
  return [...grouped.values()].slice(0, 8).map(entry => ({
    kind: 'ulica' as const, miejscowosc: city, ulica: entry.name, numer_budynku: '', kod_pocztowy: singlePostcode(entry.codes), teryt: '', simc: '', ulic: '',
    szerokosc_geograficzna: entry.lat, dlugosc_geograficzna: entry.lon, accuracy: 0, label: `${entry.name}, ${city}`,
  }));
}

async function photonHouses(city: string, street: string, number: string, near?: GeoPoint): Promise<RegistryAddress[]> {
  const point = await cityPoint(city, near);
  const features = await photonSearch(`${street} ${number} ${city}`, 'house', point);
  const seen = new Set<string>();
  const hits: RegistryAddress[] = [];
  const prefix = number.toLocaleLowerCase('pl');
  for (const feature of features) {
    const props = feature.properties || {};
    const house = props.housenumber?.trim() || '';
    const name = (props.street || props.name || '').trim();
    if (!samePlace(props.city || props.locality || '', city) || fold(name) !== fold(street) || !house.toLocaleLowerCase('pl').startsWith(prefix)) continue;
    const coords = photonCoords(feature);
    if (!coords) continue;
    const key = `${fold(name)}|${house.toLocaleLowerCase('pl')}|${props.postcode || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kod = props.postcode?.trim() || '';
    hits.push({ kind: 'adres', miejscowosc: city, ulica: street, numer_budynku: house, kod_pocztowy: kod, teryt: '', simc: '', ulic: '', szerokosc_geograficzna: coords.lat, dlugosc_geograficzna: coords.lon, accuracy: 0, label: [`${street} ${house}`, kod, city].filter(Boolean).join(', ') });
    if (hits.length === 8) break;
  }
  return hits;
}

async function cityPoint(city: string, near?: GeoPoint): Promise<GeoPoint> {
  if (near) return near;
  const [hit] = (await photonCities(city)).filter(item => fold(item.miejscowosc) === fold(city));
  return hit ? { lat: hit.szerokosc_geograficzna, lon: hit.dlugosc_geograficzna } : { lat: 52, lon: 19 };
}

async function photonSearch(query: string, layer: 'street' | 'house', near: GeoPoint): Promise<PhotonFeature[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&layer=${layer}&lang=default&limit=15&lat=${near.lat}&lon=${near.lon}`;
  try {
    const body = await fetchJson(url) as { features?: PhotonFeature[] };
    return body.features || [];
  } catch { return []; }
}

function photonCoords(feature: PhotonFeature): GeoPoint | null {
  const [lon, lat] = feature.geometry?.coordinates || [];
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

function samePlace(found: string, expected: string): boolean {
  return fold(found) === fold(expected);
}

function photonCity(feature: PhotonFeature): RegistryAddress | null {
  const props = feature.properties || {};
  if (props.countrycode !== 'PL' || props.osm_key !== 'place') return null;
  if (!['city', 'town', 'village', 'hamlet', 'municipality'].includes(props.osm_value || '')) return null;
  const [lon, lat] = feature.geometry?.coordinates || [];
  if (!props.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const region = props.state?.replace(/^województwo\s+/i, '').trim();
  const kod = singlePostcode([props.postcode || '']);
  return {
    kind: 'miejscowosc', miejscowosc: props.name, ulica: '', numer_budynku: '', kod_pocztowy: kod, teryt: '', simc: '', ulic: '',
    szerokosc_geograficzna: lat, dlugosc_geograficzna: lon, accuracy: 0,
    label: region ? `${props.name}, ${region}` : props.name,
  };
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
