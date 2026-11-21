import { AED_COLUMNS, AedColumn, AedDevice, AedRow, EMPTY_DEVICE, IMPORT_FIELDS, Issue } from './aed.models';

export function today(): string { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function validDate(s: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + 'T12:00:00Z'); return !isNaN(+d) && d.toISOString().slice(0,10) === s; }

const fold = (s: string) => s.trim().toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l');

export function isRegon(s: string): boolean {
  const weights = s.length === 9 ? [8,9,2,3,4,5,6,7] : s.length === 14 ? [2,4,8,5,0,9,7,3,6,1,2,4,8] : null;
  if (!weights || !/^\d+$/.test(s)) return false;
  const sum = weights.reduce((acc, w, i) => acc + w * Number(s[i]), 0);
  return (sum % 11) % 10 === Number(s[s.length - 1]);
}

const DAY = '(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)';
const DAYS = `${DAY}(?:-${DAY})?(?:,${DAY}(?:-${DAY})?)*`;
const TIME = '(?:[01]\\d|2[0-4]):[0-5]\\d';
const TIMES = `(?:${TIME}-${TIME}(?:,${TIME}-${TIME})*|off)`;
const OPENING_HOURS = new RegExp(`^(?:24/7|(?:${DAYS} )?${TIMES}(?:; ?(?:${DAYS} )?${TIMES})*)$`);
/** Subset of the OpenStreetMap opening_hours syntax, e.g. "Mo-Fr 08:00-16:00; Sa 09:00-14:00". */
export function validOpeningHours(s: string): boolean { return OPENING_HOURS.test(s.trim()); }

const PL_DAYS: Record<string, string> = { Mo: 'pon.', Tu: 'wt.', We: 'śr.', Th: 'czw.', Fr: 'pt.', Sa: 'sob.', Su: 'niedz.', PH: 'święta' };
export function formatHours(s: string): string {
  if (!s) return '';
  if (s.trim() === '24/7') return 'całodobowo';
  return s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, d => PL_DAYS[d]).replace(/(\.|y)-(\S)/g, '$1–$2').replace(/\boff\b/g, 'nieczynne').replace(/;\s*/g, ', ');
}

const DAY_ALIASES: Record<string, string> = { pon: 'Mo', pn: 'Mo', wt: 'Tu', sr: 'We', czw: 'Th', cz: 'Th', pt: 'Fr', sob: 'Sa', sb: 'Sa', niedz: 'Su', nd: 'Su', ndz: 'Su' };
/** Converts simple Polish notations ("pon.–pt. 8:00–16:00, sob. 9–14") to opening_hours; returns the input unchanged when unsure. */
export function toOpeningHours(text: string): string {
  const value = text.trim();
  if (!value || validOpeningHours(value)) return value;
  if (/^(24\/7|calodobowo|całodobowo|24h)$/i.test(value)) return '24/7';
  const pad = (h: string, m?: string) => `${h.padStart(2, '0')}:${m ?? '00'}`;
  const rules = fold(value).split(/[;,]\s*(?=[a-z])/).map(segment => {
    const m = segment.trim().match(/^([a-z]+)\.?\s*(?:[-–]\s*([a-z]+)\.?)?\s+(\d{1,2})(?:[:.](\d{2}))?\s*[-–]\s*(\d{1,2})(?:[:.](\d{2}))?$/);
    if (!m || !DAY_ALIASES[m[1]] || (m[2] && !DAY_ALIASES[m[2]])) return null;
    const days = DAY_ALIASES[m[1]] + (m[2] ? '-' + DAY_ALIASES[m[2]] : '');
    return `${days} ${pad(m[3], m[4])}-${pad(m[5], m[6])}`;
  });
  return rules.every(Boolean) ? rules.join('; ') : value;
}

/** Demo subset; production should resolve the code from TERYT / PRG by address or coordinates. */
const TERYT_GMINY: Record<string, string> = { bydgoszcz: '0461011', torun: '0463011', warszawa: '1465011', krakow: '1261011', lodz: '1061011', wroclaw: '0264011', poznan: '3064011', gdansk: '2261011' };
export function suggestTeryt(miejscowosc: string): string { return TERYT_GMINY[fold(miejscowosc)] ?? ''; }

export function splitAddress(address: string): { ulica: string; numer_budynku: string } {
  const m = address.trim().match(/^(.*?)[\s,]+(\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?)$/);
  return m ? { ulica: m[1].trim(), numer_budynku: m[2] } : { ulica: address.trim(), numer_budynku: '' };
}

export function validateDevice(d: AedRow, now = today()): Issue[] {
  const issues: Issue[] = [];
  const error = (field: string, message: string) => issues.push({ field, message, severity: 'error' });
  const warn = (field: string, message: string) => issues.push({ field, message, severity: 'warning' });
  const required: [AedColumn, string][] = [['nazwa_miejsca','Podaj nazwę miejsca.'],['miejscowosc','Podaj miejscowość.'],['numer_budynku','Podaj numer budynku.'],['opis_lokalizacji','Opisz dokładnie, gdzie znajduje się AED.']];
  for (const [key, message] of required) if (!String(d[key] ?? '').trim()) error(key, message);
  if (!/^\d{2}-\d{3}$/.test(d.kod_pocztowy)) error('kod_pocztowy', 'Kod pocztowy musi mieć format 00-000.');
  if (!d.teryt_gminy) warn('teryt_gminy', 'Brak kodu TERYT gminy. Uzupełnij go albo wybierz znaną miejscowość.');
  else if (!/^\d{7}$/.test(d.teryt_gminy)) error('teryt_gminy', 'Kod TERYT gminy ma 7 cyfr, np. 0461011.');
  const lat = d.szerokosc_geograficzna, lon = d.dlugosc_geograficzna;
  if (lat === null || !Number.isFinite(lat) || lat < 49 || lat > 55) error('szerokosc_geograficzna', 'Podaj szerokość geograficzną w Polsce (49–55), np. 53.1215.');
  if (lon === null || !Number.isFinite(lon) || lon < 14 || lon > 24.2) error('dlugosc_geograficzna', 'Podaj długość geograficzną w Polsce (14–24,2), np. 17.9992.');
  if (d.regon_dysponenta && !isRegon(d.regon_dysponenta)) error('regon_dysponenta', 'Niepoprawny REGON dysponenta.');
  if (!['calodobowa','w_godzinach','ograniczona','nieznana'].includes(d.dostepnosc)) error('dostepnosc', 'Wybierz dostępność ze słownika.');
  if (!['sprawne','niesprawne','nieznany'].includes(d.stan_urzadzenia)) error('stan_urzadzenia', 'Wybierz stan urządzenia ze słownika.');
  if (d.dostepnosc === 'w_godzinach' && !d.godziny_dostepnosci.trim()) error('godziny_dostepnosci', 'Podaj godziny dostępności, np. Mo-Fr 08:00-16:00.');
  else if (d.godziny_dostepnosci.trim() && !validOpeningHours(d.godziny_dostepnosci)) error('godziny_dostepnosci', 'Zapisz godziny w formacie Mo-Fr 08:00-16:00; Sa 09:00-14:00.');
  if (d.dostepnosc === 'ograniczona' && !d.uwagi_dostepu.trim()) error('uwagi_dostepu', 'Opisz, jak uzyskać dostęp do urządzenia.');
  for (const key of ['data_waznosci_baterii','data_waznosci_elektrod','data_przegladu','data_weryfikacji'] as const) {
    const value = d[key];
    if (value && !validDate(value)) error(key, 'Podaj rzeczywistą datę w formacie RRRR-MM-DD.');
    else if (value && key !== 'data_weryfikacji' && value < now) warn(key, 'Termin upłynął. Sprawdź urządzenie i zaktualizuj dane.');
  }
  if (d.data_weryfikacji && d.data_weryfikacji > now) error('data_weryfikacji', 'Weryfikacja nie może mieć przyszłej daty.');
  if (!d.data_weryfikacji) warn('data_weryfikacji', 'Brak daty weryfikacji danych.');
  if (!d.data_waznosci_baterii) warn('data_waznosci_baterii', 'Brak daty ważności baterii.');
  if (!d.data_waznosci_elektrod) warn('data_waznosci_elektrod', 'Brak daty ważności elektrod.');
  if (d.dostepnosc === 'nieznana') warn('dostepnosc', 'Dostęp do urządzenia nie został potwierdzony.');
  return issues;
}
export function needsReview(d: AedRow): boolean { return validateDevice(d).length > 0 || !d.data_weryfikacji || (Date.now() - new Date(d.data_weryfikacji + 'T12:00:00').getTime()) > 90 * 86400000; }
export function hasExpiredParts(d: AedRow): boolean { return [d.data_waznosci_baterii, d.data_waznosci_elektrod, d.data_przegladu].some(v => !!v && validDate(v) && v < today()); }
export function distanceKm(lat: number, lon: number, d: AedRow): number {
  const dLat = d.szerokosc_geograficzna, dLon = d.dlugosc_geograficzna;
  if (dLat === null || dLon === null) return Infinity;
  const r = Math.PI / 180;
  const a = Math.sin((dLat - lat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(dLat * r) * Math.sin((dLon - lon) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function formatAddress(d: AedRow): string { return [d.ulica, d.numer_budynku].filter(Boolean).join(' '); }

/** Only dataset columns; status, revision and history stay in the module. */
export function publicRow(d: AedRow): AedRow { return Object.fromEntries(AED_COLUMNS.map(c => [c.name, d[c.name]])) as unknown as AedRow; }

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return String(value);
  let s = String(value);
  if (/^[=+@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}
/** CSV resource of the shared dataset: UTF-8, comma separator, header = AED_COLUMNS names, decimal point in coordinates. */
export function exportCsv(rows: AedRow[]): string { return '\ufeff' + [AED_COLUMNS.map(c => c.name).join(','), ...rows.map(d => AED_COLUMNS.map(c => csvEscape(d[c.name])).join(','))].join('\r\n'); }
export function exportJson(rows: AedRow[]): string { return JSON.stringify(rows.map(publicRow), null, 2); }

export function parseCsv(input: string): {headers:string[]; rows:string[][]} {
  const text=input.replace(/^\ufeff/,''); if (text.length > 2*1024*1024) throw new Error('Maksymalny rozmiar pliku to 2 MB.');
  const first=text.split(/\r?\n/)[0] || ''; const separator=(first.match(/;/g)||[]).length >= (first.match(/,/g)||[]).length ? ';' : ',';
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quote=false;
  for(let i=0;i<text.length;i++){const c=text[i]; if(c==='"'){ if(quote && text[i+1]==='"'){cell+='"';i++;}else quote=!quote; }else if(c===separator && !quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
  if(quote)throw new Error('Nie zamknięto cudzysłowu w pliku CSV.'); row.push(cell); if(row.some(v=>v.trim()))rows.push(row);
  const headers=rows.shift()?.map(v=>v.trim()) || []; if(!headers.length || !rows.length)throw new Error('Plik musi zawierać nagłówki i co najmniej jeden rekord.');
  if(new Set(headers).size!==headers.length)throw new Error('Nazwy kolumn muszą być unikalne.');
  if(rows.length>500)throw new Error('W jednym imporcie możesz dodać maksymalnie 500 urządzeń.');
  if(rows.some(r=>r.length!==headers.length))throw new Error('Wiersze mają różną liczbę kolumn. Sprawdź separator i cudzysłowy.');
  return {headers,rows};
}

const ALIASES: Partial<Record<AedColumn, string[]>> = {
  id_zrodlowe: ['id', 'identyfikator', 'numer id', 'nr', 'lp', 'id w zrodle', 'nr inwentarzowy'],
  nazwa_miejsca: ['nazwa', 'nazwa miejsca', 'miejsce', 'obiekt', 'nazwa obiektu'],
  teryt_gminy: ['teryt', 'kod teryt', 'teryt gminy'],
  miejscowosc: ['miasto', 'miejscowosc', 'gmina'],
  ulica: ['ulica', 'adres', 'ulica i numer'],
  numer_budynku: ['numer', 'nr budynku', 'numer budynku', 'numer domu'],
  kod_pocztowy: ['kod', 'kod pocztowy'],
  szerokosc_geograficzna: ['lat', 'latitude', 'szerokosc', 'szerokosc geograficzna', 'y'],
  dlugosc_geograficzna: ['lon', 'lng', 'longitude', 'dlugosc', 'dlugosc geograficzna', 'x'],
  opis_lokalizacji: ['opis', 'lokalizacja', 'wskazowki', 'opis lokalizacji', 'gdzie'],
  dostepnosc: ['dostepnosc', 'dostep'],
  godziny_dostepnosci: ['godziny', 'godziny otwarcia', 'godziny dostepnosci'],
  uwagi_dostepu: ['uwagi', 'warunki dostepu', 'uwagi dostepu'],
  stan_urzadzenia: ['stan', 'stan urzadzenia'],
  data_waznosci_baterii: ['bateria', 'waznosc baterii'],
  data_waznosci_elektrod: ['elektrody', 'waznosc elektrod'],
  data_przegladu: ['przeglad', 'serwis', 'termin przegladu'],
  data_weryfikacji: ['potwierdzono', 'data weryfikacji', 'weryfikacja', 'data sprawdzenia'],
};
const normHeader = (h: string) => fold(h).replace(/[^a-z0-9]+/g, ' ').trim();
export function suggestMapping(headers: string[]): Record<string, string> {
  return Object.fromEntries(IMPORT_FIELDS.map(f => [f, headers.find(h => normHeader(h) === normHeader(f) || (ALIASES[f] ?? []).includes(normHeader(h))) || '']));
}

const ACCESS_VALUES: Record<string, AedRow['dostepnosc']> = { calodobowa: 'calodobowa', calodobowo: 'calodobowa', '24/7': 'calodobowa', '24h': 'calodobowa', w_godzinach: 'w_godzinach', 'w godzinach': 'w_godzinach', godziny: 'w_godzinach', ograniczona: 'ograniczona', ograniczony: 'ograniczona', nieznana: 'nieznana', nieznany: 'nieznana' };
const STATE_VALUES: Record<string, AedRow['stan_urzadzenia']> = { sprawne: 'sprawne', sprawny: 'sprawne', niesprawne: 'niesprawne', niesprawny: 'niesprawne', nieznany: 'nieznany' };
export function mappedDevice(headers: string[], row: string[], mapping: Record<string, string>): AedDevice {
  const d: AedDevice = { ...EMPTY_DEVICE, history: [], zrodlo_danych: 'import_csv' };
  const value = (f: string) => { const i = headers.indexOf(mapping[f]); return i >= 0 ? (row[i] || '').trim() : ''; };
  for (const f of IMPORT_FIELDS) {
    const v = value(f);
    if (f === 'szerokosc_geograficzna' || f === 'dlugosc_geograficzna') { d[f] = v === '' ? null : Number(v.replace(',', '.')); continue; }
    if (f === 'dostepnosc') { d.dostepnosc = ACCESS_VALUES[fold(v)] ?? 'nieznana'; continue; }
    if (f === 'stan_urzadzenia') { d.stan_urzadzenia = STATE_VALUES[fold(v)] ?? 'nieznany'; continue; }
    if (f.startsWith('data_')) { const m = v.match(/^(\d{2})[./](\d{2})[./](\d{4})$/); (d as any)[f] = m ? `${m[3]}-${m[2]}-${m[1]}` : v; continue; }
    (d as any)[f] = v;
  }
  if (!d.numer_budynku && d.ulica) Object.assign(d, splitAddress(d.ulica));
  if (d.godziny_dostepnosci) d.godziny_dostepnosci = toOpeningHours(d.godziny_dostepnosci);
  if (d.dostepnosc === 'nieznana' && validOpeningHours(d.godziny_dostepnosci)) d.dostepnosc = d.godziny_dostepnosci === '24/7' ? 'calodobowa' : 'w_godzinach';
  if (!d.teryt_gminy) d.teryt_gminy = suggestTeryt(d.miejscowosc);
  return d;
}

export function sameDevice(a: AedRow, b: AedRow): boolean {
  const norm = (s: string) => s.trim().toLocaleLowerCase('pl').replace(/\s+/g, ' ');
  if (a.id_aed && a.id_aed === b.id_aed) return true;
  if (a.id_zrodlowe && a.id_zrodlowe === b.id_zrodlowe) return true;
  return norm(a.nazwa_miejsca) === norm(b.nazwa_miejsca) && norm(a.miejscowosc) === norm(b.miejscowosc) && norm(a.ulica) === norm(b.ulica) && norm(a.numer_budynku) === norm(b.numer_budynku);
}
