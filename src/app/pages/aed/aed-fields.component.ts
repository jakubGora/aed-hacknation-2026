import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output, PLATFORM_ID, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeafletService } from '@app/services/leflet.service';
import type { LayerGroup, LeafletMouseEvent, Map } from 'leaflet';
import { fieldSuggestionQuery, RegistryAddress, registryQuery, suggestRegistry, terytFromRegistry } from './aed-address';
import { AED_COLUMNS, AedColumn, AedDevice, DOSTEPNOSC_LABELS, FIELD_LABELS, STAN_LABELS } from './aed.models';
import { formatHours, suggestTeryt, terytFollowsPlace, toOpeningHours, today, validateDevice, validOpeningHours } from './aed.logic';

type Coord = 'szerokosc_geograficzna' | 'dlugosc_geograficzna';

@Component({selector:'aed-fields',standalone:true,imports:[CommonModule,FormsModule],providers:[LeafletService],template:`
  <fieldset class="aed-fieldset"><legend>Lokalizacja urządzenia</legend>
    <div class="aed-form-grid">
      <ng-container *ngFor="let f of locationFields">
      <div class="aed-field" [class.wide]="f==='nazwa_miejsca'||f==='opis_lokalizacji'">
        <label [for]="prefix+f">{{labels[f]}} <span class="aed-required" *ngIf="required(f)">(wymagane)</span></label>
        <textarea *ngIf="f==='opis_lokalizacji'" [id]="prefix+f" [(ngModel)]="$any(device)[f]" (ngModelChange)="changed.emit()" rows="3" maxlength="1000" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="prefix+f+'-hint'"></textarea>
        <div class="aed-combobox" *ngIf="f!=='opis_lokalizacji'">
          <input [id]="prefix+f" type="text" autocomplete="off" [(ngModel)]="$any(device)[f]" (ngModelChange)="onText(f)" [attr.maxlength]="f==='kod_pocztowy'?6:f==='teryt_gminy'?7:200" [attr.inputmode]="f==='teryt_gminy'?'numeric':null" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="prefix+f+'-hint'" [attr.aria-expanded]="suggestField===f && fieldHits.length ? true : null" role="combobox" aria-autocomplete="list" [attr.aria-controls]="suggestField===f && fieldHits.length ? prefix+f+'-list' : null" />
          <ul class="aed-address-hits" *ngIf="suggestField===f && fieldHits.length" role="listbox" [id]="prefix+f+'-list'"><li *ngFor="let hit of fieldHits" role="presentation"><button type="button" role="option" (mousedown)="$event.preventDefault()" (click)="pickSuggestion(hit)"><span>{{hitTitle(hit)}}</span><span class="aed-hit-meta" *ngIf="hitMeta(hit)">{{hitMeta(hit)}}</span></button></li></ul>
        </div>
        <small [id]="prefix+f+'-hint'" [class.aed-error]="hasError(f)" [class.aed-warning-text]="!hasError(f)&&!!message(f)">{{message(f) || hints[f]}}</small>
      </div>
      <div class="aed-field wide aed-locate" *ngIf="f==='kod_pocztowy'">
        <p class="aed-muted">Znajdź lokalizację wpisanego adresu, a potem kliknij mapę w miejscu, gdzie stoi urządzenie.</p>
        <button type="button" class="aed-button secondary" (click)="findOnMap()" [disabled]="busy">Znajdź lokalizację</button>
        <p class="aed-registry" [class.ok]="statusKind==='ok'" [class.warn]="statusKind==='warn'" role="status" *ngIf="status">{{status}}</p>
        <div #picker class="aed-picker-map" role="application" aria-label="Mapa. Kliknij, aby ustawić położenie urządzenia."></div>
        <div class="aed-form-grid">
          <div class="aed-field"><label [for]="prefix+'szerokosc_geograficzna'">{{labels['szerokosc_geograficzna']}} <span class="aed-required">(wymagane)</span></label><input [id]="prefix+'szerokosc_geograficzna'" type="text" inputmode="decimal" autocomplete="off" [ngModel]="raw['szerokosc_geograficzna']" (ngModelChange)="setCoord('szerokosc_geograficzna', $event)" [attr.aria-invalid]="hasError('szerokosc_geograficzna')" [attr.aria-describedby]="prefix+'szerokosc_geograficzna-hint'" /><small [id]="prefix+'szerokosc_geograficzna-hint'" [class.aed-error]="hasError('szerokosc_geograficzna')">{{message('szerokosc_geograficzna') || 'Albo wpisz ręcznie, np. 53.1235.'}}</small></div>
          <div class="aed-field"><label [for]="prefix+'dlugosc_geograficzna'">{{labels['dlugosc_geograficzna']}} <span class="aed-required">(wymagane)</span></label><input [id]="prefix+'dlugosc_geograficzna'" type="text" inputmode="decimal" autocomplete="off" [ngModel]="raw['dlugosc_geograficzna']" (ngModelChange)="setCoord('dlugosc_geograficzna', $event)" [attr.aria-invalid]="hasError('dlugosc_geograficzna')" [attr.aria-describedby]="prefix+'dlugosc_geograficzna-hint'" /><small [id]="prefix+'dlugosc_geograficzna-hint'" [class.aed-error]="hasError('dlugosc_geograficzna')">{{message('dlugosc_geograficzna') || 'Albo wpisz ręcznie, np. 18.0084.'}}</small></div>
        </div>
      </div>
      </ng-container>
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
  <fieldset class="aed-fieldset"><legend>Identyfikacja urządzenia</legend><div class="aed-form-grid">
    <div class="aed-field"><label [for]="prefix+'numer_seryjny'">{{labels['numer_seryjny']}} <span class="aed-required">(wymagane do publikacji)</span></label><input [id]="prefix+'numer_seryjny'" [(ngModel)]="device.numer_seryjny" (ngModelChange)="changed.emit()" maxlength="64" [attr.aria-invalid]="hasError('numer_seryjny')"/><small>Numer z obudowy. Ten sam numer nie może wystąpić drugi raz w zbiorze.</small><small class="aed-error">{{error('numer_seryjny')}}</small></div>
    <div class="aed-field"><label [for]="prefix+'id_zrodlowe'">{{labels['id_zrodlowe']}}</label><input [id]="prefix+'id_zrodlowe'" [(ngModel)]="device.id_zrodlowe" (ngModelChange)="changed.emit()" maxlength="100"/><small>Opcjonalny numer z Twojej ewidencji. Nie zastępuje numeru seryjnego.</small></div>
    <div class="aed-field" *ngIf="device.id_aed"><label [for]="prefix+'id_aed'">{{labels['id_aed']}}</label><input [id]="prefix+'id_aed'" [value]="device.id_aed" readonly/><small>Nadawany automatycznie, stały w zbiorze.</small></div>
  </div></fieldset>
`})
export class AedFieldsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() device!:AedDevice; @Input() showErrors=false; @Input() prefix='aed-'; @Output() changed=new EventEmitter<void>();
  @ViewChild('picker') picker?: ElementRef<HTMLElement>;
  private leaflet=inject(LeafletService); private zone=inject(NgZone); private platform=inject(PLATFORM_ID);
  private map?: Map; private layer?: LayerGroup;
  labels=FIELD_LABELS; access=DOSTEPNOSC_LABELS; states=STAN_LABELS; accessKeys=Object.keys(DOSTEPNOSC_LABELS); stateKeys=Object.keys(STAN_LABELS); now=today();
  locationFields:AedColumn[]=['nazwa_miejsca','miejscowosc','teryt_gminy','ulica','numer_budynku','kod_pocztowy','opis_lokalizacji'];
  dates:AedColumn[]=['data_waznosci_baterii','data_waznosci_elektrod','data_przegladu','data_weryfikacji'];
  hints:Record<string,string>={nazwa_miejsca:'Np. Biblioteka Miejska — wejście główne',miejscowosc:'Zacznij pisać i wybierz miejscowość z listy. Kod TERYT uzupełni się sam.',teryt_gminy:'7 cyfr. Uzupełnia się po wyborze miejscowości.',ulica:'Zacznij pisać po wyborze miejscowości. Puste, jeśli miejscowość nie ma ulic.',numer_budynku:'Wybierz numer z listy, żeby doprecyzować kod pocztowy.',kod_pocztowy:'Uzupełnia się po wyborze miejscowości, ulicy albo numeru. Format 00-000.',opis_lokalizacji:'Wejście, piętro, recepcja lub położenie skrzynki.'};
  raw:Record<string,string>={}; fieldHits:RegistryAddress[]=[]; suggestField=''; placePoint:{miejscowosc:string;lat:number;lon:number}|null=null; postalPlace=''; status=''; statusKind:'ok'|'warn'|''=''; busy=false;
  private suggestTimer=0; private suggestGen=0;
  ngOnChanges(changes:SimpleChanges){
    this.raw={szerokosc_geograficzna:this.coordText(this.device.szerokosc_geograficzna),dlugosc_geograficzna:this.coordText(this.device.dlugosc_geograficzna)};
    if(changes['device'] && !changes['device'].firstChange){ this.fieldHits=[]; this.suggestField=''; this.clearStatus(); }
    this.placeMarker(true);
  }
  ngAfterViewInit(){
    if(!isPlatformBrowser(this.platform)||!this.picker)return;
    this.map=this.leaflet.createMap(this.picker,{center:[53.1235,18.0084],zoom:19,maxZoom:19,scrollWheelZoom:false});
    this.leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(this.map);
    this.map.setMaxZoom(19);
    this.layer=this.leaflet.layerGroup().addTo(this.map);
    this.map.on('click',(event:LeafletMouseEvent)=>this.zone.run(()=>this.pick(event.latlng.lat,event.latlng.lng)));
    this.placeMarker(true);
    setTimeout(()=>this.map?.invalidateSize(),0);
  }
  ngOnDestroy(){ window.clearTimeout(this.suggestTimer); this.suggestGen++; this.map?.remove(); }
  private coordText(v:number|null){ return v===null||v===undefined||!Number.isFinite(v)?'':String(v); }
  setCoord(f:Coord, value:string){ this.raw[f]=value; const v=value.trim().replace(',','.'); this.device[f]=v===''?null:/^-?\d+(\.\d+)?$/.test(v)?Number(v):NaN; this.placeMarker(false); this.changed.emit(); }
  pick(lat:number, lon:number){ this.setCoord('szerokosc_geograficzna',lat.toFixed(6)); this.setCoord('dlugosc_geograficzna',lon.toFixed(6)); this.placeMarker(true); }
  private placeMarker(pan:boolean){
    if(!this.map||!this.layer)return;
    this.layer.clearLayers();
    const lat=this.device.szerokosc_geograficzna, lon=this.device.dlugosc_geograficzna;
    if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    this.leaflet.marker([lat as number,lon as number],{icon:this.leaflet.divIcon({className:'aed-pin is-active',iconSize:[32,28],iconAnchor:[16,26],html:''}),keyboard:false,alt:'Wybrany punkt'}).addTo(this.layer);
    if(pan)this.map.setView([lat as number,lon as number],19);
  }
  apply(hit:RegistryAddress){
    this.remember(hit);
    this.device.miejscowosc=hit.miejscowosc;
    this.device.ulica=hit.ulica?`ul. ${hit.ulica}`:'';
    this.device.numer_budynku=hit.numer_budynku;
    this.adoptPostal(hit, false);
    this.writeTeryt(hit.miejscowosc, hit.teryt);
    if(!this.device.teryt_gminy) void this.completeTeryt(hit.miejscowosc);
    this.setCoord('szerokosc_geograficzna',hit.szerokosc_geograficzna.toFixed(6));
    this.setCoord('dlugosc_geograficzna',hit.dlugosc_geograficzna.toFixed(6));
    this.placeMarker(true);
    this.clearStatus();
    this.changed.emit();
  }
  private clearStatus(){ this.status=''; this.statusKind=''; }
  private report(text:string, kind:'ok'|'warn'|''){ this.status=text; this.statusKind=kind; }
  private async run(pending:string, task:()=>Promise<void>){ this.busy=true; this.report(pending,''); try{ await task(); }catch(e){ this.report(e instanceof Error?e.message:'Nie udało się sprawdzić adresu.','warn'); } finally{ this.busy=false; } }
  onText(f:string){
    if(f==='miejscowosc'){ this.syncTeryt(this.device.miejscowosc); this.syncPostal(this.device.miejscowosc); }
    if(f==='kod_pocztowy') this.postalPlace='';
    if(f==='miejscowosc'||f==='ulica'||f==='numer_budynku') this.scheduleField(f);
    else if(this.suggestField===f){ this.fieldHits=[]; this.suggestField=''; }
    this.changed.emit();
  }
  private scheduleField(field:string){
    this.suggestField=field;
    this.fieldHits=[];
    window.clearTimeout(this.suggestTimer);
    const text=fieldSuggestionQuery(field as 'miejscowosc'|'ulica'|'numer_budynku', this.device);
    if(!text) return;
    this.suggestTimer=window.setTimeout(()=>void this.loadField(text), 300);
  }
  private async loadField(text:string){
    const gen=++this.suggestGen;
    const same=this.placePoint && this.placePoint.miejscowosc.toLocaleLowerCase('pl')===this.device.miejscowosc.trim().toLocaleLowerCase('pl');
    const near=same&&this.placePoint?{lat:this.placePoint.lat,lon:this.placePoint.lon}:undefined;
    try{
      const hits=await suggestRegistry(text, near);
      if(gen!==this.suggestGen)return;
      this.fieldHits=hits;
    }catch{ if(gen===this.suggestGen) this.fieldHits=[]; }
  }
  pickSuggestion(hit:RegistryAddress){
    if(hit.kind==='adres'){ this.fieldHits=[]; this.suggestField=''; this.apply(hit); return; }
    if(this.suggestField==='miejscowosc'||hit.kind==='miejscowosc'){
      this.remember(hit);
      this.device.miejscowosc=hit.miejscowosc;
      this.writeTeryt(hit.miejscowosc, hit.teryt);
      this.adoptPostal(hit, true);
      this.focusMap(hit);
      this.fieldHits=[]; this.suggestField='';
      this.changed.emit();
      if(!this.device.teryt_gminy) void this.completeTeryt(hit.miejscowosc);
      return;
    }
    this.remember(hit);
    this.device.ulica=hit.ulica?`ul. ${hit.ulica}`:this.device.ulica;
    this.adoptPostal(hit, false);
    this.focusMap(hit);
    this.fieldHits=[]; this.suggestField='';
    this.changed.emit();
  }
  private remember(hit:RegistryAddress){ this.placePoint={miejscowosc:hit.miejscowosc,lat:hit.szerokosc_geograficzna,lon:hit.dlugosc_geograficzna}; }
  hitTitle(hit:RegistryAddress){ const cut=hit.label.indexOf(', '); return cut<0?hit.label:hit.label.slice(0,cut); }
  hitMeta(hit:RegistryAddress){ const cut=hit.label.indexOf(', '); return cut<0?'':hit.label.slice(cut+2); }
  private writeTeryt(miejscowosc:string, registryCode=''){ this.device.teryt_gminy=terytFromRegistry(miejscowosc, registryCode)||suggestTeryt(miejscowosc); }
  private adoptPostal(hit:RegistryAddress, replace:boolean){
    if(/^\d{2}-\d{3}$/.test(hit.kod_pocztowy)){ this.device.kod_pocztowy=hit.kod_pocztowy; this.postalPlace=hit.miejscowosc.trim().toLocaleLowerCase('pl'); }
    else if(replace){ this.device.kod_pocztowy=''; this.postalPlace=''; }
  }
  private syncPostal(miejscowosc:string){
    const typed=miejscowosc.trim().toLocaleLowerCase('pl');
    if(!this.postalPlace) return;
    if(!typed || !(this.postalPlace.startsWith(typed) || typed.startsWith(this.postalPlace))){ this.device.kod_pocztowy=''; this.postalPlace=''; }
  }
  private focusMap(hit:RegistryAddress){ this.map?.setView([hit.szerokosc_geograficzna, hit.dlugosc_geograficzna], 19); }
  async findOnMap(){
    if(this.device.miejscowosc.trim().length<3){ this.report('Wpisz miejscowość, a potem znajdź lokalizację.','warn'); return; }
    const near=this.placePoint && this.placePoint.miejscowosc.toLocaleLowerCase('pl')===this.device.miejscowosc.trim().toLocaleLowerCase('pl') ? {lat:this.placePoint.lat, lon:this.placePoint.lon} : undefined;
    await this.run('Szukam lokalizacji…', async()=>{
      const hits=await suggestRegistry(registryQuery(this.device), near);
      const hit=hits.find(item=>item.kind==='adres') || hits[0];
      if(!hit){ this.report('Nie znaleziono lokalizacji dla wpisanego adresu.','warn'); return; }
      this.remember(hit);
      this.adoptPostal(hit, false);
      this.focusMap(hit);
      this.report('Mapa pokazuje ten adres. Kliknij punkt, w którym stoi urządzenie.','ok');
    });
  }
  private syncTeryt(miejscowosc:string){
    const code=suggestTeryt(miejscowosc);
    if(code) this.device.teryt_gminy=code;
    else if(!terytFollowsPlace(this.device.teryt_gminy, miejscowosc)) this.device.teryt_gminy='';
  }
  private async completeTeryt(miejscowosc:string){
    try{
      const [hit]=await suggestRegistry(miejscowosc);
      if(this.device.miejscowosc!==miejscowosc||this.device.teryt_gminy||!hit)return;
      const teryt=terytFromRegistry(hit.miejscowosc,hit.teryt)||suggestTeryt(hit.miejscowosc);
      if(teryt){ this.device.teryt_gminy=teryt; this.changed.emit(); }
    }catch{ /* the code stays empty and can be typed by hand */ }
  }
  normalizeHours(){ const v=toOpeningHours(this.device.godziny_dostepnosci); if(v!==this.device.godziny_dostepnosci){ this.device.godziny_dostepnosci=v; this.changed.emit(); } }
  get hoursPreview(){ return validOpeningHours(this.device.godziny_dostepnosci)?formatHours(this.device.godziny_dostepnosci):''; }
  required(f:string){ return AED_COLUMNS.find(c=>c.name===f)?.required==='tak'; }
  error(f:string){return this.showErrors?validateDevice(this.device).find(i=>i.field===f&&i.severity==='error')?.message||'':'';}
  hasError(f:string){return !!this.error(f);}
  message(f:string){return this.showErrors?validateDevice(this.device).find(i=>i.field===f)?.message||'':'';}
}
