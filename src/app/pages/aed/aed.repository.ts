import { inject, Injectable, InjectionToken } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, defer, of } from 'rxjs';
import { AedContext, AedDevice, AedRow, Dysponent, EMPTY_DEVICE } from './aed.models';
import { publicRow, sameDevice, validateDevice } from './aed.logic';

export const AED_CONFIG = new InjectionToken<{demo:boolean; apiUrl:string}>('AED_CONFIG',{providedIn:'root',factory:()=>({demo:false,apiUrl:'/api/aed/v1'})});
export type ImportResult = { added: number; skipped: number };

export abstract class AedRepository {
  abstract context(): Observable<AedContext>;
  /** Published rows of the shared dataset (all dysponents). */
  abstract listPublic(): Observable<AedRow[]>;
  /** Rows of the signed-in dysponent, including drafts. */
  abstract listMine(): Observable<AedDevice[]>;
  abstract save(device: AedDevice): Observable<AedDevice>;
  abstract import(devices: AedDevice[]): Observable<ImportResult>;
}

@Injectable({providedIn:'root'})
export class HttpAedRepository extends AedRepository {
  private http = inject(HttpClient); private config = inject(AED_CONFIG);
  private opts = { withCredentials: true };
  context() { return this.http.get<AedContext>(`${this.config.apiUrl}/context`, this.opts); }
  listPublic() { return this.http.get<AedRow[]>(`${this.config.apiUrl}/public/devices`, this.opts); }
  listMine() { return this.http.get<AedDevice[]>(`${this.config.apiUrl}/devices`, this.opts); }
  save(d: AedDevice) {
    return d.id_aed
      ? this.http.put<AedDevice>(`${this.config.apiUrl}/devices/${encodeURIComponent(d.id_aed)}`, d, { ...this.opts, headers: { 'If-Match': String(d.revision) } })
      : this.http.post<AedDevice>(`${this.config.apiUrl}/devices`, d, this.opts);
  }
  import(devices: AedDevice[]) { return this.http.post<ImportResult>(`${this.config.apiUrl}/imports`, { devices }, this.opts); }
}

export const DEMO_DYSPONENT: Dysponent = { regon: '123456785', nazwa: 'Miejskie Centrum Aktywności — demo', portal_institution_id: null };
export const OTHER_DYSPONENT: Dysponent = { regon: '987654326', nazwa: 'Fundacja Sąsiedzi — demo', portal_institution_id: null };
export const DEMO_STORAGE_KEY = 'aed-hacknation-v2';

function initialDevices(): AedDevice[] {
  const at = '2026-11-18T10:00:00Z';
  const rows: Partial<AedDevice>[] = [
    { nazwa_miejsca: 'Centrum Sąsiedzkie Nad Brdą', ulica: 'ul. Gdańska', numer_budynku: '20', kod_pocztowy: '85-005', szerokosc_geograficzna: 53.1278, dlugosc_geograficzna: 18.0058, dostepnosc: 'calodobowa', opis_lokalizacji: 'Skrzynka na zewnętrznej ścianie przy wejściu głównym.', data_waznosci_baterii: '2027-08-12', data_waznosci_elektrod: '2027-06-30' },
    { nazwa_miejsca: 'Biblioteka Miejska — filia pokazowa', ulica: 'ul. Długa', numer_budynku: '12', kod_pocztowy: '85-034', szerokosc_geograficzna: 53.1215, dlugosc_geograficzna: 17.9992, dostepnosc: 'w_godzinach', godziny_dostepnosci: 'Mo-Fr 08:00-18:00; Sa 09:00-14:00', data_waznosci_baterii: '2027-02-01', data_waznosci_elektrod: '2027-10-31' },
    { nazwa_miejsca: 'Hala Sportowa — punkt pokazowy', ulica: 'ul. Toruńska', numer_budynku: '15', kod_pocztowy: '85-023', szerokosc_geograficzna: 53.1182, dlugosc_geograficzna: 18.0127, dostepnosc: 'ograniczona', godziny_dostepnosci: 'Mo-Su 07:00-22:00', uwagi_dostepu: 'Urządzenie wydaje pracownik recepcji.', data_waznosci_baterii: '2026-10-15', data_waznosci_elektrod: '2027-05-01' },
    { nazwa_miejsca: 'Dom Kultury — punkt pokazowy', ulica: 'ul. Jagiellońska', numer_budynku: '10', kod_pocztowy: '85-097', szerokosc_geograficzna: 53.1234, dlugosc_geograficzna: 18.0098, dostepnosc: 'nieznana', stan_urzadzenia: 'nieznany', data_weryfikacji: '' },
    { nazwa_miejsca: 'Centrum Wolontariatu — demo', ulica: 'ul. Dworcowa', numer_budynku: '30', kod_pocztowy: '85-009', szerokosc_geograficzna: 53.1293, dlugosc_geograficzna: 17.9977, dostepnosc: 'calodobowa', data_waznosci_baterii: '2027-11-30', data_waznosci_elektrod: '2027-08-12' },
  ];
  return rows.map((r, i) => {
    const owner = i === 4 ? OTHER_DYSPONENT : DEMO_DYSPONENT;
    const number = i === 4 ? 1 : i + 1;
    return {
      ...EMPTY_DEVICE,
      id_aed: `AED-${owner.regon}-${String(number).padStart(4, '0')}`, id_zrodlowe: `DEMO-${i + 1}`,
      regon_dysponenta: owner.regon, nazwa_dysponenta: owner.nazwa,
      teryt_gminy: '0461011', miejscowosc: 'Bydgoszcz', opis_lokalizacji: 'Parter, przy recepcji. Wejście od strony ulicy.',
      stan_urzadzenia: 'sprawne', data_weryfikacji: '2026-11-18', zrodlo_danych: 'formularz', data_aktualizacji: at,
      ...r,
      status: 'published', revision: 1, history: [{ at, action: 'Utworzono rekord demonstracyjny' }],
    } as AedDevice;
  });
}

function nextId(data: AedDevice[], regon: string): string {
  const prefix = `AED-${regon}-`;
  const max = Math.max(0, ...data.filter(d => d.id_aed.startsWith(prefix)).map(d => Number(d.id_aed.slice(prefix.length)) || 0));
  return prefix + String(max + 1).padStart(4, '0');
}

@Injectable({providedIn:'root'})
export class MockAedRepository extends AedRepository {
  private isEditor() { return sessionStorage.getItem('aed-demo-editor') === 'yes'; }
  context() { return of<AedContext>(this.isEditor() ? { dysponent: DEMO_DYSPONENT, canEdit: true } : { dysponent: null, canEdit: false }); }
  private read(): AedDevice[] { try { const s = localStorage.getItem(DEMO_STORAGE_KEY); return s ? JSON.parse(s) : initialDevices(); } catch { throw new Error('Nie można odczytać lokalnych danych. Użyj resetu demonstracji.'); } }
  private persist(data: AedDevice[]) { try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(data)); } catch { throw new Error('Nie udało się zapisać danych w przeglądarce. Sprawdź dostępne miejsce.'); } }
  private assertEditor() { if (!this.isEditor()) throw new Error('Wymagany dostęp dysponenta AED.'); }
  listPublic() { return defer(() => of(this.read().filter(d => d.status === 'published').map(publicRow))); }
  listMine() { return defer(() => { this.assertEditor(); return of(this.read().filter(d => d.regon_dysponenta === DEMO_DYSPONENT.regon)); }); }
  save(input: AedDevice) {
    return defer(() => {
      this.assertEditor();
      const data = this.read();
      const existing = data.find(d => d.id_aed === input.id_aed);
      if (input.id_aed && !existing) throw new Error('Nie znaleziono urządzenia.');
      if (existing && existing.regon_dysponenta !== DEMO_DYSPONENT.regon) throw new Error('Możesz edytować tylko urządzenia swojego dysponenta.');
      if (existing && existing.revision !== input.revision) throw new Error('Rekord został zmieniony. Odśwież dane przed zapisem.');
      if (input.status === 'published' && validateDevice(input).some(i => i.severity === 'error')) throw new Error('Uzupełnij wymagane dane przed publikacją.');
      const at = new Date().toISOString();
      const action = !existing ? 'Dodano urządzenie' : existing.status !== input.status ? (input.status === 'published' ? 'Opublikowano w zbiorze' : 'Wycofano do szkicu') : 'Zaktualizowano dane urządzenia';
      const d: AedDevice = {
        ...input,
        id_aed: existing?.id_aed || nextId(data, DEMO_DYSPONENT.regon),
        regon_dysponenta: DEMO_DYSPONENT.regon, nazwa_dysponenta: DEMO_DYSPONENT.nazwa,
        data_aktualizacji: at, revision: (existing?.revision || 0) + 1,
        history: [...(existing?.history || []), { at, action: input.status === 'draft' && !existing ? 'Zapisano szkic' : action }],
      };
      this.persist(existing ? data.map(v => v.id_aed === d.id_aed ? d : v) : [...data, d]);
      return of(d);
    });
  }
  import(devices: AedDevice[]) {
    return defer(() => {
      this.assertEditor();
      const data = this.read();
      if (devices.some(d => validateDevice(d).some(i => i.severity === 'error'))) throw new Error('Import zawiera niepoprawne rekordy.');
      let added = 0, skipped = 0;
      for (const input of devices) {
        if (data.some(d => d.regon_dysponenta === DEMO_DYSPONENT.regon && sameDevice(d, input))) { skipped++; continue; }
        const at = new Date().toISOString();
        data.push({
          ...input, id_aed: nextId(data, DEMO_DYSPONENT.regon),
          regon_dysponenta: DEMO_DYSPONENT.regon, nazwa_dysponenta: DEMO_DYSPONENT.nazwa,
          zrodlo_danych: 'import_csv', data_aktualizacji: at, status: 'published', revision: 1,
          history: [{ at, action: 'Dodano z importu CSV' }],
        });
        added++;
      }
      this.persist(data);
      return of({ added, skipped });
    });
  }
  reset() { localStorage.removeItem(DEMO_STORAGE_KEY); localStorage.removeItem('aed-hacknation-v1'); }
}
export const AED_REPOSITORY = new InjectionToken<AedRepository>('AED_REPOSITORY',{providedIn:'root',factory:()=>inject(AED_CONFIG).demo?inject(MockAedRepository):inject(HttpAedRepository)});
