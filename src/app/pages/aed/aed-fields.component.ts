import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output, PLATFORM_ID, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeafletService } from '@app/services/leflet.service';
import type { LayerGroup, LeafletMouseEvent, Map } from 'leaflet';
import { addressesMatch, RegistryAddress, registryQuery, reverseRegistry, searchRegistry, terytFromRegistry } from './aed-address';
import { AED_COLUMNS, AedColumn, AedDevice, DOSTEPNOSC_LABELS, FIELD_LABELS, STAN_LABELS } from './aed.models';
import { distanceKm, formatHours, suggestTeryt, toOpeningHours, today, validateDevice, validOpeningHours } from './aed.logic';

type Coord = 'szerokosc_geograficzna' | 'dlugosc_geograficzna';

@Component({selector:'aed-fields',standalone:true,imports:[CommonModule,FormsModule],providers:[LeafletService],template:`
  <fieldset class="aed-fieldset"><legend>Lokalizacja urządzenia</legend>
    <div class="aed-form-grid">
      <div class="aed-field" *ngFor="let f of locationFields" [class.wide]="f==='nazwa_miejsca'||f==='opis_lokalizacji'">
        <label [for]="prefix+f">{{labels[f]}} <span class="aed-required" *ngIf="required(f)">(wymagane)</span></label>
        <textarea *ngIf="f==='opis_lokalizacji'; else input" [id]="prefix+f" [(ngModel)]="$any(device)[f]" (ngModelChange)="changed.emit()" rows="3" maxlength="1000" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="prefix+f+'-hint'"></textarea>
        <ng-template #input>
          <input *ngIf="isCoord(f); else text" [id]="prefix+f" type="text" inputmode="decimal" autocomplete="off" [ngModel]="raw[f]" (ngModelChange)="setCoord($any(f), $event)" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="prefix+f+'-hint'" />
          <ng-template #text><input [id]="prefix+f" type="text" [(ngModel)]="$any(device)[f]" (ngModelChange)="onText(f)" [attr.maxlength]="f==='kod_pocztowy'?6:f==='teryt_gminy'?7:200" [attr.inputmode]="f==='teryt_gminy'?'numeric':null" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="prefix+f+'-hint'" /></ng-template>
        </ng-template>
        <small [id]="prefix+f+'-hint'" [class.aed-error]="hasError(f)" [class.aed-warning-text]="!hasError(f)&&!!message(f)">{{message(f) || hints[f]}}</small>
      </div>
    </div>
    <div class="aed-locator">
      <div class="aed-locator-search">
        <label [for]="prefix+'rejestr'">Szukaj adresu w rejestrze</label>
        <div class="aed-locator-row">
          <input [id]="prefix+'rejestr'" type="search" [(ngModel)]="query" (keydown.enter)="$event.preventDefault(); search()" placeholder="Np. Bydgoszcz, Długa 12" />
          <button type="button" class="aed-button secondary" (click)="search()" [disabled]="busy">Szukaj</button>
        </div>
        <ul class="aed-address-hits" *ngIf="hits.length"><li *ngFor="let hit of hits"><button type="button" (click)="apply(hit)">{{hit.label}}</button></li></ul>
        <p class="aed-registry" [class.ok]="statusKind==='ok'" [class.warn]="statusKind==='warn'" role="status" *ngIf="status">{{status}}</p>
        <div class="aed-actions">
          <button type="button" class="aed-button secondary" *ngIf="pointOffer" (click)="applyPoint(pointOffer)">Ustaw punkt z rejestru</button>
          <button type="button" class="aed-button secondary" *ngIf="addressOffer" (click)="apply(addressOffer)">Wpisz adres z punktu</button>
          <button type="button" class="aed-button secondary" (click)="checkTyped()" [disabled]="busy">Sprawdź wpisany adres</button>
        </div>
        <p class="aed-muted">Źródło: Państwowy Rejestr Granic (GUGiK). Brak adresu w rejestrze nie blokuje zapisu — urządzenie może stać obok punktu adresowego.</p>
      </div>
      <div>
        <div #picker class="aed-picker-map" role="application" aria-label="Mapa. Kliknij, aby ustawić położenie urządzenia."></div>
        <p class="aed-muted">Kliknij mapę, aby ustawić współrzędne. Sprawdzimy, jaki adres jest w tym miejscu.</p>
      </div>
    </div>
  </fieldset>
  <fieldset class="aed-fieldset"><legend>Dostęp i stan urządzenia</legend><div class="aed-form-grid">
    <div class="aed-field"><label [for]="prefix+'dostepnosc'">Dostępność <span class="aed-required">(wymagane)</span></label><select [id]="prefix+'dostepnosc'" [(ngModel)]="device.dostepnosc" (ngModelChange)="changed.emit()"><option *ngFor="let a of accessKeys" [value]="a">{{access[a]}}</option></select><small [class.aed-error]="hasError('dostepnosc')" [class.aed-warning-text]="!hasError('dostepnosc')">{{message('dostepnosc')}}</small></div>
    <div class="aed-field"><label [for]="prefix+'stan_urzadzenia'">Stan urządzenia <span class="aed-required">(wymagane)</span></label><select [id]="prefix+'stan_urzadzenia'" [(ngModel)]="device.stan_urzadzenia" (ngModelChange)="changed.emit()"><option *ngFor="let c of stateKeys" [value]="c">{{states[c]}}</option></select><small class="aed-error" *ngIf="error('stan_urzadzenia')">{{error('stan_urzadzenia')}}</small></div>
    <div class="aed-field wide" *ngIf="device.dostepnosc==='w_godzinach'||device.dostepnosc==='ograniczona'">
      <label [for]="prefix+'godziny_dostepnosci'">{{labels['godziny_dostepnosci']}} <span class="aed-required" *ngIf="device.dostepnosc==='w_godzinach'">(wymagane)</span></label>
      <input [id]="prefix+'godziny_dostepnosci'" [(ngModel)]="device.godziny_dostepnosci" (ngModelChange)="changed.emit()" (blur)="normalizeHours()" placeholder="Mo-Fr 08:00-18:00; Sa 09:00-14:00" maxlength="200" [attr.aria-invalid]="hasError('godziny_dostepnosci')" [attr.aria-describedby]="prefix+'godziny-hint'"/>
      <small [id]="prefix+'godziny-hint'" [class.aed-error]="hasError('godziny_dostepnosci')">{{error('godziny_dostepnosci') || (hoursPreview ? 'Odczyt: ' + hoursPreview : 'Format OpenStreetMap. Możesz wpisać też „pon.–pt. 8:00–18:00” — zamienimy to automatycznie.')}}</small>
    </div>
    <div class="aed-field wide" *ngIf="device.dostepnosc==='ograniczona'||device.uwagi_dostepu">
      <label [for]="prefix+'uwagi_dostepu'">{{labels['uwagi_dostepu']}} <span class="aed-required" *ngIf="device.dostepnosc==='ograniczona'">(wymagane)</span></label>
      <input [id]="prefix+'uwagi_dostepu'" [(ngModel)]="device.uwagi_dostepu" (ngModelChange)="changed.emit()" placeholder="Np. urządzenie wydaje pracownik recepcji" maxlength="500" [attr.aria-invalid]="hasError('uwagi_dostepu')"/>
      <small class="aed-error">{{error('uwagi_dostepu')}}</small>
    </div>
  </div></fieldset>
  <fieldset class="aed-fieldset"><legend>Terminy i weryfikacja</legend><p class="aed-muted">Jeśli nie znasz daty, pozostaw pole puste. Upływ terminu nie usuwa urządzenia ze zbioru, ale oznacza je jako wymagające sprawdzenia.</p><div class="aed-form-grid">
    <div class="aed-field" *ngFor="let f of dates"><label [for]="prefix+f">{{labels[f]}} <span class="aed-required" *ngIf="required(f)">(wymagane do publikacji)</span></label><input type="date" [id]="prefix+f" [(ngModel)]="$any(device)[f]" (ngModelChange)="changed.emit()" [attr.max]="f==='data_weryfikacji'?now:null" [attr.aria-invalid]="hasError(f)"/><small [class.aed-error]="hasError(f)" [class.aed-warning-text]="!hasError(f)">{{message(f)}}</small></div>
  </div></fieldset>
  <fieldset class="aed-fieldset"><legend>Identyfikator w Twojej ewidencji</legend><div class="aed-form-grid">
    <div class="aed-field"><label [for]="prefix+'id_zrodlowe'">{{labels['id_zrodlowe']}}</label><input [id]="prefix+'id_zrodlowe'" [(ngModel)]="device.id_zrodlowe" (ngModelChange)="changed.emit()" maxlength="100"/><small>Opcjonalnie — pomaga uniknąć duplikatów przy kolejnych importach.</small></div>
    <div class="aed-field" *ngIf="device.id_aed"><label [for]="prefix+'id_aed'">{{labels['id_aed']}}</label><input [id]="prefix+'id_aed'" [value]="device.id_aed" readonly/><small>Nadawany automatycznie, stały w zbiorze.</small></div>
  </div></fieldset>
`})
export class AedFieldsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() device!:AedDevice; @Input() showErrors=false; @Input() prefix='aed-'; @Output() changed=new EventEmitter<void>();
  @ViewChild('picker') picker?: ElementRef<HTMLElement>;
  private leaflet=inject(LeafletService); private zone=inject(NgZone); private platform=inject(PLATFORM_ID);
  private map?: Map; private layer?: LayerGroup;
  labels=FIELD_LABELS; access=DOSTEPNOSC_LABELS; states=STAN_LABELS; accessKeys=Object.keys(DOSTEPNOSC_LABELS); stateKeys=Object.keys(STAN_LABELS); now=today();
  locationFields:AedColumn[]=['nazwa_miejsca','miejscowosc','teryt_gminy','ulica','numer_budynku','kod_pocztowy','szerokosc_geograficzna','dlugosc_geograficzna','opis_lokalizacji'];
  dates:AedColumn[]=['data_waznosci_baterii','data_waznosci_elektrod','data_przegladu','data_weryfikacji'];
  hints:Record<string,string>={nazwa_miejsca:'Np. Biblioteka Miejska — wejście główne',teryt_gminy:'7 cyfr. Uzupełniamy automatycznie dla znanych miejscowości i z rejestru adresów.',ulica:'Pozostaw puste, jeśli miejscowość nie ma ulic.',kod_pocztowy:'Format 00-000',szerokosc_geograficzna:'WGS84, np. 53.1235. Możesz kliknąć mapę.',dlugosc_geograficzna:'WGS84, np. 18.0084. Możesz kliknąć mapę.',opis_lokalizacji:'Wejście, piętro, recepcja lub położenie skrzynki.'};
  raw:Record<string,string>={}; query=''; hits:RegistryAddress[]=[]; status=''; statusKind:'ok'|'warn'|''=''; busy=false;
  pointOffer:RegistryAddress|null=null; addressOffer:RegistryAddress|null=null;
  ngOnChanges(changes:SimpleChanges){
    this.raw={szerokosc_geograficzna:this.coordText(this.device.szerokosc_geograficzna),dlugosc_geograficzna:this.coordText(this.device.dlugosc_geograficzna)};
    if(changes['device'] && !changes['device'].firstChange){ this.query=''; this.hits=[]; this.clearStatus(); }
    this.placeMarker(true);
  }
  ngAfterViewInit(){
    if(!isPlatformBrowser(this.platform)||!this.picker)return;
    this.map=this.leaflet.createMap(this.picker,{center:[53.1235,18.0084],zoom:13,scrollWheelZoom:false});
    this.leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(this.map);
    this.layer=this.leaflet.layerGroup().addTo(this.map);
    this.map.on('click',(event:LeafletMouseEvent)=>this.zone.run(()=>this.pick(event.latlng.lat,event.latlng.lng)));
    this.placeMarker(true);
    setTimeout(()=>this.map?.invalidateSize(),0);
  }
  ngOnDestroy(){ this.map?.remove(); }
  private coordText(v:number|null){ return v===null||v===undefined||!Number.isFinite(v)?'':String(v); }
  isCoord(f:string){ return f==='szerokosc_geograficzna'||f==='dlugosc_geograficzna'; }
  setCoord(f:Coord, value:string){ this.raw[f]=value; const v=value.trim().replace(',','.'); this.device[f]=v===''?null:/^-?\d+(\.\d+)?$/.test(v)?Number(v):NaN; this.placeMarker(false); this.changed.emit(); }
  pick(lat:number, lon:number){ this.setCoord('szerokosc_geograficzna',lat.toFixed(6)); this.setCoord('dlugosc_geograficzna',lon.toFixed(6)); this.placeMarker(true); this.lookupPoint(); }
  private placeMarker(pan:boolean){
    if(!this.map||!this.layer)return;
    this.layer.clearLayers();
    const lat=this.device.szerokosc_geograficzna, lon=this.device.dlugosc_geograficzna;
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    this.leaflet.circleMarker([lat as number,lon as number],{radius:11,color:'#ffffff',weight:3,fillColor:'#b32636',fillOpacity:1}).addTo(this.layer);
    if(pan)this.map.setView([lat as number,lon as number],Math.max(this.map.getZoom(),16));
  }
  async search(){
    const text=this.query.trim();
    if(text.length<3){ this.report('Wpisz adres, np. Bydgoszcz, Długa 12.','warn'); return; }
    await this.run('Szukam adresu w rejestrze…', async()=>{
      this.hits=await searchRegistry(text);
      this.pointOffer=null; this.addressOffer=null;
      if(!this.hits.length) this.report('Nie znaleziono takiego adresu w rejestrze. Sprawdź pisownię albo wskaż punkt na mapie.','warn');
      else this.report(this.hits.length===1?'Znaleziono adres. Kliknij go, aby uzupełnić formularz.':'Wybierz adres z listy.','ok');
    });
  }
  async checkTyped(){
    const text=registryQuery(this.device);
    if(!this.device.miejscowosc.trim()||!this.device.numer_budynku.trim()){ this.report('Wpisz miejscowość i numer budynku, a potem sprawdź adres.','warn'); return; }
    await this.run('Sprawdzam adres w rejestrze…', async()=>{
      const [hit]=await searchRegistry(text);
      this.hits=[]; this.pointOffer=null; this.addressOffer=null;
      if(!hit){ this.report('Nie znaleziono tego adresu w Państwowym Rejestrze Granic.','warn'); return; }
      if(!addressesMatch(this.device,hit)){ this.addressOffer=hit; this.report(`To nie jest ten adres. Najbliższe dopasowanie: ${hit.label}.`,'warn'); return; }
      const gap=distanceKm(hit.szerokosc_geograficzna,hit.dlugosc_geograficzna,this.device);
      const postal=this.device.kod_pocztowy && hit.kod_pocztowy && this.device.kod_pocztowy!==hit.kod_pocztowy ? ` Kod w rejestrze: ${hit.kod_pocztowy}.` : '';
      if(!Number.isFinite(gap)||gap>0.04){ this.pointOffer=hit; this.report(`Adres jest w rejestrze.${postal} Punkt na mapie jest od niego oddalony — możesz ustawić współrzędne z rejestru.`,'warn'); return; }
      this.report(`Adres jest w rejestrze i punkt leży przy tym budynku.${postal}${this.terytNote(hit)}`,'ok');
    });
  }
  async lookupPoint(){
    const lat=this.device.szerokosc_geograficzna, lon=this.device.dlugosc_geograficzna;
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    await this.run('Sprawdzam punkt w rejestrze…', async()=>{
      const hit=await reverseRegistry(lat as number,lon as number);
      this.hits=[]; this.pointOffer=null;
      if(!hit){ this.addressOffer=null; this.report('Przy tym punkcie rejestr nie ma adresu.','warn'); return; }
      const same=addressesMatch(this.device,hit);
      this.addressOffer=same?null:hit;
      this.report(same?`Punkt pokrywa się z wpisanym adresem: ${hit.label}.`:`W tym miejscu rejestr podaje: ${hit.label}.`,'ok');
    });
  }
  apply(hit:RegistryAddress){
    this.device.miejscowosc=hit.miejscowosc;
    this.device.ulica=hit.ulica?`ul. ${hit.ulica}`:'';
    this.device.numer_budynku=hit.numer_budynku;
    if(hit.kod_pocztowy)this.device.kod_pocztowy=hit.kod_pocztowy;
    const teryt=terytFromRegistry(hit.miejscowosc,hit.teryt);
    if(teryt)this.device.teryt_gminy=teryt;
    this.setCoord('szerokosc_geograficzna',hit.szerokosc_geograficzna.toFixed(6));
    this.setCoord('dlugosc_geograficzna',hit.dlugosc_geograficzna.toFixed(6));
    this.placeMarker(true);
    this.hits=[]; this.pointOffer=null; this.addressOffer=null;
    this.report(`Uzupełniono z rejestru: ${hit.label}.${this.terytNote(hit)}`,'ok');
    this.changed.emit();
  }
  applyPoint(hit:RegistryAddress){
    this.setCoord('szerokosc_geograficzna',hit.szerokosc_geograficzna.toFixed(6));
    this.setCoord('dlugosc_geograficzna',hit.dlugosc_geograficzna.toFixed(6));
    this.placeMarker(true);
    this.pointOffer=null;
    this.report(`Punkt ustawiony przy adresie ${hit.label}.`,'ok');
  }
  private terytNote(hit:RegistryAddress){ return hit.teryt && !terytFromRegistry(hit.miejscowosc,hit.teryt) ? ` Rejestr podaje TERC ${hit.teryt} bez cyfry rodzaju gminy — dopisz pełny, 7-cyfrowy kod.` : ''; }
  private clearStatus(){ this.status=''; this.statusKind=''; this.pointOffer=null; this.addressOffer=null; }
  private report(text:string, kind:'ok'|'warn'|''){ this.status=text; this.statusKind=kind; }
  private async run(pending:string, task:()=>Promise<void>){ this.busy=true; this.report(pending,''); try{ await task(); }catch(e){ this.report(e instanceof Error?e.message:'Nie udało się sprawdzić adresu.','warn'); } finally{ this.busy=false; } }
  onText(f:string){ if(f==='miejscowosc'&&!this.device.teryt_gminy){ const code=suggestTeryt(this.device.miejscowosc); if(code)this.device.teryt_gminy=code; } this.changed.emit(); }
  normalizeHours(){ const v=toOpeningHours(this.device.godziny_dostepnosci); if(v!==this.device.godziny_dostepnosci){ this.device.godziny_dostepnosci=v; this.changed.emit(); } }
  get hoursPreview(){ return validOpeningHours(this.device.godziny_dostepnosci)?formatHours(this.device.godziny_dostepnosci):''; }
  required(f:string){ return AED_COLUMNS.find(c=>c.name===f)?.required==='tak'; }
  error(f:string){return this.showErrors?validateDevice(this.device).find(i=>i.field===f&&i.severity==='error')?.message||'':'';}
  hasError(f:string){return !!this.error(f);}
  message(f:string){return this.showErrors?validateDevice(this.device).find(i=>i.field===f)?.message||'':'';}
}
