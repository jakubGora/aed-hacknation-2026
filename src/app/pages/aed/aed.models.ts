export type Dostepnosc = 'calodobowa' | 'w_godzinach' | 'ograniczona' | 'nieznana';
export type StanUrzadzenia = 'sprawne' | 'niesprawne' | 'nieznany';
export type ZrodloDanych = 'formularz' | 'import_csv' | 'zbior_dostawcy';
/** Same values as the `status` attribute in the dane.gov.pl XML import. Only `published` rows reach the dataset. */
export type StatusRekordu = 'published' | 'draft';

/** One row of the shared dataset "Defibrylatory AED w Polsce" = one column set of the CSV resource in dane.gov.pl. */
export interface AedRow {
  id_aed: string;
  id_zrodlowe: string;
  regon_dysponenta: string;
  nazwa_dysponenta: string;
  nazwa_miejsca: string;
  teryt_gminy: string;
  miejscowosc: string;
  ulica: string;
  numer_budynku: string;
  kod_pocztowy: string;
  szerokosc_geograficzna: number | null;
  dlugosc_geograficzna: number | null;
  opis_lokalizacji: string;
  dostepnosc: Dostepnosc;
  godziny_dostepnosci: string;
  uwagi_dostepu: string;
  stan_urzadzenia: StanUrzadzenia;
  data_waznosci_baterii: string;
  data_waznosci_elektrod: string;
  data_przegladu: string;
  data_weryfikacji: string;
  zrodlo_danych: ZrodloDanych;
  data_aktualizacji: string;
}

/** Module record: a dataset row plus working state that is never published. */
export interface AedDevice extends AedRow {
  status: StatusRekordu;
  revision: number;
  history: { at: string; action: string }[];
}

/** Organisation allowed to maintain its own rows in the shared dataset. */
export interface Dysponent { regon: string; nazwa: string; portal_institution_id: string | null; }
export interface AedContext { dysponent: Dysponent | null; canEdit: boolean; }
export interface Issue { field: string; message: string; severity: 'error' | 'warning'; }

export type AedColumn = keyof AedRow;
export interface ColumnSpec {
  name: AedColumn;
  label: string;
  type: 'string' | 'number' | 'date' | 'datetime';
  required: 'tak' | 'nie' | 'warunkowo';
  filledBy: 'dysponent' | 'system';
  description: string;
  example: string;
}

/** Reference data scope: drives the CSV/JSON export, CSV import mapping and labels. */
export const AED_COLUMNS: ColumnSpec[] = [
  { name: 'id_aed', label: 'Identyfikator AED', type: 'string', required: 'tak', filledBy: 'system', description: 'Stały identyfikator urządzenia we wspólnym zbiorze.', example: 'AED-123456785-0001' },
  { name: 'id_zrodlowe', label: 'Identyfikator u dysponenta', type: 'string', required: 'nie', filledBy: 'dysponent', description: 'Identyfikator z ewidencji dysponenta. Chroni przed duplikatami przy ponownym imporcie.', example: 'INW-2023-014' },
  { name: 'regon_dysponenta', label: 'REGON dysponenta', type: 'string', required: 'tak', filledBy: 'system', description: 'REGON organizacji odpowiedzialnej za dane (9 lub 14 cyfr).', example: '123456785' },
  { name: 'nazwa_dysponenta', label: 'Nazwa dysponenta', type: 'string', required: 'tak', filledBy: 'system', description: 'Nazwa organizacji odpowiedzialnej za dane.', example: 'Miejskie Centrum Aktywności' },
  { name: 'nazwa_miejsca', label: 'Nazwa miejsca', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Nazwa obiektu, w którym znajduje się AED.', example: 'Biblioteka Miejska — filia nr 3' },
  { name: 'teryt_gminy', label: 'Kod TERYT gminy', type: 'string', required: 'tak', filledBy: 'dysponent', description: '7-cyfrowy kod gminy z rejestru TERYT. Ten sam identyfikator portal stosuje dla regionów zbioru.', example: '0461011' },
  { name: 'miejscowosc', label: 'Miejscowość', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Nazwa miejscowości.', example: 'Bydgoszcz' },
  { name: 'ulica', label: 'Ulica', type: 'string', required: 'nie', filledBy: 'dysponent', description: 'Nazwa ulicy z prefiksem. Pusta w miejscowościach bez ulic.', example: 'ul. Długa' },
  { name: 'numer_budynku', label: 'Numer budynku', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Numer porządkowy budynku.', example: '12A' },
  { name: 'kod_pocztowy', label: 'Kod pocztowy', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Format 00-000.', example: '85-001' },
  { name: 'szerokosc_geograficzna', label: 'Szerokość geograficzna', type: 'number', required: 'tak', filledBy: 'dysponent', description: 'WGS84, stopnie dziesiętne, kropka jako separator. Zakres dla Polski 49–55.', example: '53.1215' },
  { name: 'dlugosc_geograficzna', label: 'Długość geograficzna', type: 'number', required: 'tak', filledBy: 'dysponent', description: 'WGS84, stopnie dziesiętne, kropka jako separator. Zakres dla Polski 14–24,2.', example: '17.9992' },
  { name: 'opis_lokalizacji', label: 'Jak znaleźć urządzenie', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Wejście, piętro, położenie skrzynki.', example: 'Parter, przy recepcji, wejście od ul. Długiej.' },
  { name: 'dostepnosc', label: 'Dostępność', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Słownik: calodobowa, w_godzinach, ograniczona, nieznana.', example: 'w_godzinach' },
  { name: 'godziny_dostepnosci', label: 'Godziny dostępności', type: 'string', required: 'warunkowo', filledBy: 'dysponent', description: 'Wymagane przy w_godzinach. Format opening_hours (OpenStreetMap).', example: 'Mo-Fr 08:00-18:00; Sa 09:00-14:00' },
  { name: 'uwagi_dostepu', label: 'Warunki dostępu', type: 'string', required: 'warunkowo', filledBy: 'dysponent', description: 'Wymagane przy dostępności ograniczonej, np. kto wydaje urządzenie.', example: 'Wydaje pracownik recepcji.' },
  { name: 'stan_urzadzenia', label: 'Stan urządzenia', type: 'string', required: 'tak', filledBy: 'dysponent', description: 'Słownik: sprawne, niesprawne, nieznany. Deklaracja dysponenta.', example: 'sprawne' },
  { name: 'data_waznosci_baterii', label: 'Ważność baterii', type: 'date', required: 'nie', filledBy: 'dysponent', description: 'RRRR-MM-DD.', example: '2027-08-12' },
  { name: 'data_waznosci_elektrod', label: 'Ważność elektrod', type: 'date', required: 'nie', filledBy: 'dysponent', description: 'RRRR-MM-DD.', example: '2027-06-30' },
  { name: 'data_przegladu', label: 'Termin przeglądu', type: 'date', required: 'nie', filledBy: 'dysponent', description: 'Termin najbliższego przeglądu serwisowego, RRRR-MM-DD.', example: '2027-03-01' },
  { name: 'data_weryfikacji', label: 'Data weryfikacji danych', type: 'date', required: 'tak', filledBy: 'dysponent', description: 'Dzień, w którym dysponent potwierdził dane. Nie data importu.', example: '2026-11-18' },
  { name: 'zrodlo_danych', label: 'Źródło danych', type: 'string', required: 'tak', filledBy: 'system', description: 'Słownik: formularz, import_csv, zbior_dostawcy.', example: 'formularz' },
  { name: 'data_aktualizacji', label: 'Data aktualizacji rekordu', type: 'datetime', required: 'tak', filledBy: 'system', description: 'Data i czas ostatniej zmiany rekordu (ISO 8601).', example: '2026-11-18T10:00:00Z' },
];

export const IMPORT_FIELDS: AedColumn[] = AED_COLUMNS.filter(c => c.filledBy === 'dysponent').map(c => c.name);
export const FIELD_LABELS: Record<string, string> = Object.fromEntries(AED_COLUMNS.map(c => [c.name, c.label]));

export const DOSTEPNOSC_LABELS: Record<Dostepnosc, string> = { calodobowa: 'Całodobowo', w_godzinach: 'W określonych godzinach', ograniczona: 'Dostęp ograniczony', nieznana: 'Dostęp niepotwierdzony' };
export const STAN_LABELS: Record<StanUrzadzenia, string> = { sprawne: 'Zgłoszone jako sprawne', niesprawne: 'Niedostępne / niesprawne', nieznany: 'Stan niepotwierdzony' };
export const ZRODLO_LABELS: Record<ZrodloDanych, string> = { formularz: 'Formularz dysponenta', import_csv: 'Import CSV dysponenta', zbior_dostawcy: 'Zbiór dostawcy w dane.gov.pl' };

export const EMPTY_DEVICE: AedDevice = {
  id_aed: '', id_zrodlowe: '', regon_dysponenta: '', nazwa_dysponenta: '', nazwa_miejsca: '', teryt_gminy: '',
  miejscowosc: '', ulica: '', numer_budynku: '', kod_pocztowy: '', szerokosc_geograficzna: null, dlugosc_geograficzna: null,
  opis_lokalizacji: '', dostepnosc: 'nieznana', godziny_dostepnosci: '', uwagi_dostepu: '', stan_urzadzenia: 'nieznany',
  data_waznosci_baterii: '', data_waznosci_elektrod: '', data_przegladu: '', data_weryfikacji: '',
  zrodlo_danych: 'formularz', data_aktualizacji: '', status: 'draft', revision: 0, history: [],
};
