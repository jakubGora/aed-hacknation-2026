import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output, PLATFORM_ID, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LeafletService } from '@app/services/leflet.service';
import type { LayerGroup, LeafletMouseEvent, Map } from 'leaflet';
import { chooseHit, fieldSuggestionQuery, RegistryAddress, suggestRegistry, terytFromRegistry } from './aed-address';
import { AED_COLUMNS, AedColumn, AedDevice, DOSTEPNOSC_LABELS, FIELD_LABELS, STAN_LABELS } from './aed.models';
import { DayHoursRow, FULL_DAY, decodeDayHours, encodeDayHours, formatHours, suggestTeryt, terytFollowsPlace, today, validateDevice, validOpeningHours } from './aed.logic';

type Coord = 'szerokosc_geograficzna' | 'dlugosc_geograficzna';

@Component({selector:'aed-fields',standalone:true,imports:[CommonModule,FormsModule],providers:[LeafletService],template:`
  <fieldset class="aed-fieldset"><legend>Lokalizacja urządzenia</legend>
    <div class="aed-form-grid">
      <ng-container *ngFor="let f of locationFields">
      <div class="aed-field" [class.wide]="f==='nazwa_miejsca'||f==='opis_lokalizacji'">
        <label [for]="prefix+f">{{labels[f]}} <span class="aed-required" *ngIf="required(f)">(wymagane)</span></label>
        <textarea *ngIf="f==='opis_lokalizacji'" [id]="prefix+f" [(ngModel)]="$any(device)[f]" (ngModelChange)="changed.emit()" rows="3" maxlength="1000" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="message(f)?prefix+f+'-hint':null"></textarea>
        <div class="aed-combobox" *ngIf="f!=='opis_lokalizacji'">
          <input [id]="prefix+f" type="text" autocomplete="off" [(ngModel)]="$any(device)[f]" (ngModelChange)="onText(f)" [attr.maxlength]="f==='kod_pocztowy'?6:f==='teryt_gminy'?7:200" [attr.inputmode]="f==='teryt_gminy'?'numeric':null" [attr.aria-invalid]="hasError(f)" [attr.aria-describedby]="message(f)?prefix+f+'-hint':null" [attr.aria-expanded]="suggestField===f && fieldHits.length ? true : null" role="combobox" aria-autocomplete="list" [attr.aria-controls]="suggestField===f && fieldHits.length ? prefix+f+'-list' : null" />
          <ul class="aed-address-hits" *ngIf="suggestField===f && fieldHits.length" role="listbox" [id]="prefix+f+'-list'"><li *ngFor="let hit of fieldHits" role="presentation"><button type="button" role="option" (mousedown)="$event.preventDefault()" (click)="pickSuggestion(hit)"><span>{{hitTitle(hit)}}</span><span class="aed-hit-meta" *ngIf="hitMeta(hit)">{{hitMeta(hit)}}</span></button></li></ul>
        </div>
        <small *ngIf="message(f)" [id]="prefix+f+'-hint'" [class.aed-error]="hasError(f)" [class.aed-warning-text]="!hasError(f)">{{message(f)}}</small>
      </div>
      <div class="aed-field wide aed-locate" *ngIf="f==='kod_pocztowy'">
        <button type="button" class="aed-button secondary" (click)="findOnMap()" [disabled]="busy">Znajdź lokalizację</button>
        <p class="aed-registry" [class.ok]="statusKind==='ok'" [class.warn]="statusKind==='warn'" role="status" *ngIf="status">{{status}}</p>
        <div #picker class="aed-picker-map" role="application" aria-label="Mapa. Kliknij, aby ustawić położenie urządzenia."></div>
        <div class="aed-form-grid">
          <div class="aed-field"><label [for]="prefix+'szerokosc_geograficzna'">{{labels['szerokosc_geograficzna']}} <span class="aed-required">(wymagane)</span></label><input [id]="prefix+'szerokosc_geograficzna'" type="text" inputmode="decimal" autocomplete="off" [ngModel]="raw['szerokosc_geograficzna']" (ngModelChange)="setCoord('szerokosc_geograficzna', $event)" [attr.aria-invalid]="hasError('szerokosc_geograficzna')" [attr.aria-describedby]="message('szerokosc_geograficzna')?prefix+'szerokosc_geograficzna-hint':null" /><small *ngIf="message('szerokosc_geograficzna')" [id]="prefix+'szerokosc_geograficzna-hint'" [class.aed-error]="hasError('szerokosc_geograficzna')" [class.aed-warning-text]="!hasError('szerokosc_geograficzna')">{{message('szerokosc_geograficzna')}}</small></div>
          <div class="aed-field"><label [for]="prefix+'dlugosc_geograficzna'">{{labels['dlugosc_geograficzna']}} <span class="aed-required">(wymagane)</span></label><input [id]="prefix+'dlugosc_geograficzna'" type="text" inputmode="decimal" autocomplete="off" [ngModel]="raw['dlugosc_geograficzna']" (ngModelChange)="setCoord('dlugosc_geograficzna', $event)" [attr.aria-invalid]="hasError('dlugosc_geograficzna')" [attr.aria-describedby]="message('dlugosc_geograficzna')?prefix+'dlugosc_geograficzna-hint':null" /><small *ngIf="message('dlugosc_geograficzna')" [id]="prefix+'dlugosc_geograficzna-hint'" [class.aed-error]="hasError('dlugosc_geograficzna')" [class.aed-warning-text]="!hasError('dlugosc_geograficzna')">{{message('dlugosc_geograficzna')}}</small></div>
        </div>
      </div>
      </ng-container>
    </div>
  </fieldset>
  <fieldset class="aed-fieldset"><legend>Dostęp i stan urządzenia</legend><div class="aed-form-grid">
    <div class="aed-field"><label [for]="prefix+'dostepnosc'">Dostępność <span class="aed-required">(wymagane)</span></label><select [id]="prefix+'dostepnosc'" [(ngModel)]="device.dostepnosc" (ngModelChange)="changed.emit()"><option *ngFor="let a of accessKeys" [value]="a">{{access[a]}}</option></select><small [class.aed-error]="hasError('dostepnosc')" [class.aed-warning-text]="!hasError('dostepnosc')">{{message('dostepnosc')}}</small></div>
    <div class="aed-field"><label [for]="prefix+'stan_urzadzenia'">Stan urządzenia <span class="aed-required">(wymagane)</span></label><select [id]="prefix+'stan_urzadzenia'" [(ngModel)]="device.stan_urzadzenia" (ngModelChange)="changed.emit()"><option *ngFor="let c of stateKeys" [value]="c">{{states[c]}}</option></select><small class="aed-error" *ngIf="error('stan_urzadzenia')">{{error('stan_urzadzenia')}}</small></div>
    <div class="aed-field wide" *ngIf="device.dostepnosc==='w_godzinach'||device.dostepnosc==='ograniczona'">
      <span class="aed-hours-heading" [id]="prefix+'godziny-label'">{{labels['godziny_dostepnosci']}} <span class="aed-required" *ngIf="device.dostepnosc==='w_godzinach'">(wymagane)</span></span>
      <div class="aed-hours" role="group" [attr.aria-labelledby]="prefix+'godziny-label'" [attr.aria-invalid]="hasError('godziny_dostepnosci')" [attr.aria-describedby]="prefix+'godziny-hint'">
        <div class="aed-hours-row" *ngFor="let row of dayHours" [class.is-off]="!row.on">
          <label class="aed-hours-day"><input type="checkbox" [(ngModel)]="row.on" (ngModelChange)="toggleDay(row)" [attr.aria-label]="'Dostępne w dniu: ' + row.label"/>{{row.label}}</label>
          <ng-container *ngIf="row.on">
            <input type="time" [(ngModel)]="row.open" (ngModelChange)="syncHours()" [attr.aria-label]="'Od — ' + row.label"/>
            <span class="aed-hours-sep" aria-hidden="true">–</span>
            <input type="time" [(ngModel)]="row.close" (ngModelChange)="syncHours()" [attr.aria-label]="'Do — ' + row.label"/>
          </ng-container>
        </div>
      </div>
      <small [id]="prefix+'godziny-hint'" [class.aed-error]="hasError('godziny_dostepnosci')">{{error('godziny_dostepnosci') || (hoursPreview ? 'Zapis: ' + hoursPreview : 'Zaznacz dzień, a wpisze się cała doba. Godziny możesz potem zmienić.')}}</small>
    </div>
    <div class="aed-field wide" *ngIf="device.dostepnosc==='ograniczona'||device.uwagi_dostepu">
      <label [for]="prefix+'uwagi_dostepu'">{{labels['uwagi_dostepu']}} <span class="aed-required" *ngIf="device.dostepnosc==='ograniczona'">(wymagane)</span></label>
      <input [id]="prefix+'uwagi_dostepu'" [(ngModel)]="device.uwagi_dostepu" (ngModelChange)="changed.emit()" placeholder="Np. urządzenie wydaje pracownik recepcji" maxlength="500" [attr.aria-invalid]="hasError('uwagi_dostepu')"/>
      <small class="aed-error">{{error('uwagi_dostepu')}}</small>
    </div>
  </div></fieldset>
  <fieldset class="aed-fieldset"><legend>Terminy i weryfikacja</legend><p class="aed-muted">Data ważności baterii i elektrod jest wymagana do publikacji, tak jak numer seryjny. Termin przeglądu możesz zostawić pusty. Upłynięty termin zostawia urządzenie w zbiorze i oznacza je do sprawdzenia.</p><div class="aed-form-grid">
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
  raw:Record<string,string>={}; fieldHits:RegistryAddress[]=[]; suggestField=''; placePoint:{miejscowosc:string;lat:number;lon:number}|null=null; postalPlace=''; status=''; statusKind:'ok'|'warn'|''=''; busy=false;
  dayHours:DayHoursRow[]=decodeDayHours('');
  private suggestTimer=0; private suggestGen=0; private locateTimer=0; private locateGen=0;
  private lastHit:RegistryAddress|null=null; private resolvedKey=''; private postalAuto=false; private coordsAuto=false;
  private locationCache:{street:RegistryAddress|null;city:RegistryAddress|null}={street:null,city:null};
  private hoursSource='';
  ngOnChanges(changes:SimpleChanges){
    this.raw={szerokosc_geograficzna:this.coordText(this.device.szerokosc_geograficzna),dlugosc_geograficzna:this.coordText(this.device.dlugosc_geograficzna)};
    if(changes['device']){
      if(this.device.godziny_dostepnosci!==this.hoursSource){
        this.dayHours=decodeDayHours(this.device.godziny_dostepnosci);
        this.hoursSource=this.device.godziny_dostepnosci;
      }
      if(!changes['device'].firstChange){ this.fieldHits=[]; this.suggestField=''; this.clearStatus(); }
    }
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
  ngOnDestroy(){ window.clearTimeout(this.suggestTimer); window.clearTimeout(this.locateTimer); this.suggestGen++; this.locateGen++; this.map?.remove(); }
  private coordText(v:number|null){ return v===null||v===undefined||!Number.isFinite(v)?'':String(v); }
  setCoord(f:Coord, value:string){ this.coordsAuto=false; this.raw[f]=value; const v=value.trim().replace(',','.'); this.device[f]=v===''?null:/^-?\d+(\.\d+)?$/.test(v)?Number(v):NaN; this.placeMarker(false); this.changed.emit(); }
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
    this.device.miejscowosc=hit.miejscowosc;
    this.device.ulica=hit.ulica?`ul. ${hit.ulica}`:'';
    this.device.numer_budynku=hit.numer_budynku;
    this.writeTeryt(hit.miejscowosc, hit.teryt);
    if(!this.device.teryt_gminy) void this.completeTeryt(hit.miejscowosc);
    this.applyResolved(hit);
    this.clearStatus();
  }
  private clearStatus(){ this.status=''; this.statusKind=''; }
  private report(text:string, kind:'ok'|'warn'|''){ this.status=text; this.statusKind=kind; }
  private async run(pending:string, task:()=>Promise<void>){ this.busy=true; this.report(pending,''); try{ await task(); }catch(e){ this.report(e instanceof Error?e.message:'Nie udało się sprawdzić adresu.','warn'); } finally{ this.busy=false; } }
  onText(f:string){
    if(f==='miejscowosc'){ this.syncTeryt(this.device.miejscowosc); this.syncPostal(this.device.miejscowosc); }
    if(f==='kod_pocztowy'){ this.postalPlace=''; this.postalAuto=false; }
    if(f==='miejscowosc'||f==='ulica'||f==='numer_budynku'){
      if(this.lastHit && !this.resolvedStillFits()) this.clearAutoLocation();
      this.scheduleField(f);
      this.scheduleLocate();
    }
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
    window.clearTimeout(this.locateTimer); this.locateGen++;
    if(hit.kind==='adres'){ this.fieldHits=[]; this.suggestField=''; this.apply(hit); return; }
    if(this.suggestField==='miejscowosc'||hit.kind==='miejscowosc'){
      this.device.miejscowosc=hit.miejscowosc;
      this.writeTeryt(hit.miejscowosc, hit.teryt);
      this.applyResolved(hit);
      this.fieldHits=[]; this.suggestField='';
      if(!this.device.teryt_gminy) void this.completeTeryt(hit.miejscowosc);
      return;
    }
    this.device.ulica=hit.ulica?`ul. ${hit.ulica}`:this.device.ulica;
    this.applyResolved(hit);
    this.fieldHits=[]; this.suggestField='';
  }
  private remember(hit:RegistryAddress){ this.placePoint={miejscowosc:hit.miejscowosc,lat:hit.szerokosc_geograficzna,lon:hit.dlugosc_geograficzna}; }
  hitTitle(hit:RegistryAddress){ const cut=hit.label.indexOf(', '); return cut<0?hit.label:hit.label.slice(0,cut); }
  hitMeta(hit:RegistryAddress){ const cut=hit.label.indexOf(', '); return cut<0?'':hit.label.slice(cut+2); }
  private writeTeryt(miejscowosc:string, registryCode=''){ this.device.teryt_gminy=terytFromRegistry(miejscowosc, registryCode)||suggestTeryt(miejscowosc); }
  private adoptPostal(hit:RegistryAddress, replace:boolean){
    if(/^\d{2}-\d{3}$/.test(hit.kod_pocztowy)){ this.device.kod_pocztowy=hit.kod_pocztowy; this.postalPlace=hit.miejscowosc.trim().toLocaleLowerCase('pl'); this.postalAuto=true; return; }
    const same=this.postalPlace===hit.miejscowosc.trim().toLocaleLowerCase('pl');
    if(replace || !same){ this.device.kod_pocztowy=''; this.postalPlace=''; this.postalAuto=true; }
  }
  private syncPostal(miejscowosc:string){
    const typed=miejscowosc.trim().toLocaleLowerCase('pl');
    if(!this.postalPlace) return;
    if(!typed || !(this.postalPlace.startsWith(typed) || typed.startsWith(this.postalPlace))){ this.device.kod_pocztowy=''; this.postalPlace=''; this.postalAuto=false; }
  }
  private scheduleLocate(){ window.clearTimeout(this.locateTimer); this.locateTimer=window.setTimeout(()=>void this.locateFromFields(), 400); }
  private async locateFromFields(){
    const gen=++this.locateGen;
    const typed=this.typedAddress();
    if(typed.miejscowosc.trim().length<3){ this.clearAutoLocation(); return; }
    try{
      const hit=await this.resolveLocation(typed, false);
      if(gen!==this.locateGen || !this.sameAddress(typed)) return;
      if(!hit){ if(!this.resolvedStillFits()) this.clearAutoLocation(); return; }
      this.applyResolved(hit);
      this.clearStatus();
    }catch{ /* the next edit tries again; a failed lookup does not wipe a point already set */ }
  }
  private typedAddress(){ return {miejscowosc:this.device.miejscowosc, ulica:this.device.ulica, numer_budynku:this.device.numer_budynku}; }
  private sameAddress(typed:{miejscowosc:string;ulica:string;numer_budynku:string}){ return this.device.miejscowosc===typed.miejscowosc && this.device.ulica===typed.ulica && this.device.numer_budynku===typed.numer_budynku; }
  private async resolveLocation(typed:{miejscowosc:string;ulica:string;numer_budynku:string}, force:boolean): Promise<RegistryAddress|null>{
    const near=this.nearFor(typed.miejscowosc);
    const city=typed.miejscowosc.trim().toLocaleLowerCase('pl');
    const street=typed.ulica.trim().toLocaleLowerCase('pl').replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/,'');
    const numberQuery=fieldSuggestionQuery('numer_budynku', typed);
    if(numberQuery){
      const house=chooseHit(await suggestRegistry(numberQuery, near), typed);
      if(house) return house;
    }
    const streetQuery=fieldSuggestionQuery('ulica', typed);
    if(streetQuery){
      const cached=this.locationCache.street;
      const fresh=force || !cached || cached.miejscowosc.trim().toLocaleLowerCase('pl')!==city || cached.ulica.trim().toLocaleLowerCase('pl')!==street;
      if(fresh) this.locationCache.street=chooseHit(await suggestRegistry(streetQuery, near), typed);
      const road=this.locationCache.street;
      if(road && road.miejscowosc.trim().toLocaleLowerCase('pl')===city && road.ulica.trim().toLocaleLowerCase('pl')===street) return road;
    } else this.locationCache.street=null;
    const cityQuery=fieldSuggestionQuery('miejscowosc', typed);
    if(!cityQuery) return null;
    const cachedCity=this.locationCache.city;
    if(force || !cachedCity || cachedCity.miejscowosc.trim().toLocaleLowerCase('pl')!==city) this.locationCache.city=chooseHit(await suggestRegistry(cityQuery), typed);
    const found=this.locationCache.city;
    return found && found.miejscowosc.trim().toLocaleLowerCase('pl')===city ? found : null;
  }
  private nearFor(miejscowosc:string){ return this.placePoint && this.placePoint.miejscowosc.toLocaleLowerCase('pl')===miejscowosc.trim().toLocaleLowerCase('pl') ? {lat:this.placePoint.lat, lon:this.placePoint.lon} : undefined; }
  private applyResolved(hit:RegistryAddress){
    const key=[hit.kind, hit.miejscowosc, hit.ulica, hit.numer_budynku, hit.kod_pocztowy, hit.szerokosc_geograficzna.toFixed(6), hit.dlugosc_geograficzna.toFixed(6)].join('|');
    this.remember(hit);
    this.lastHit=hit;
    if(hit.kind==='ulica') this.locationCache.street=hit;
    if(hit.kind==='miejscowosc') this.locationCache.city=hit;
    this.adoptPostal(hit, hit.kind==='miejscowosc');
    if(key===this.resolvedKey) return;
    this.resolvedKey=key;
    this.writeCoords(hit.szerokosc_geograficzna, hit.dlugosc_geograficzna);
  }
  private writeCoords(lat:number, lon:number){
    this.coordsAuto=true;
    this.raw['szerokosc_geograficzna']=lat.toFixed(6);
    this.raw['dlugosc_geograficzna']=lon.toFixed(6);
    this.device.szerokosc_geograficzna=Number(lat.toFixed(6));
    this.device.dlugosc_geograficzna=Number(lon.toFixed(6));
    this.placeMarker(true);
    this.changed.emit();
  }
  private clearAutoLocation(){
    this.resolvedKey=''; this.lastHit=null;
    if(this.postalAuto){ this.device.kod_pocztowy=''; this.postalPlace=''; this.postalAuto=false; }
    if(this.coordsAuto){
      this.coordsAuto=false;
      this.device.szerokosc_geograficzna=null; this.device.dlugosc_geograficzna=null;
      this.raw['szerokosc_geograficzna']=''; this.raw['dlugosc_geograficzna']='';
      this.placeMarker(false);
    }
  }
  private resolvedStillFits(){
    const hit=this.lastHit;
    if(!hit) return false;
    const city=this.device.miejscowosc.trim().toLocaleLowerCase('pl');
    const locCity=hit.miejscowosc.trim().toLocaleLowerCase('pl');
    if(!city || !(locCity.startsWith(city) || city.startsWith(locCity))) return false;
    const street=this.device.ulica.trim().toLocaleLowerCase('pl').replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/,'');
    const locStreet=hit.ulica.trim().toLocaleLowerCase('pl');
    if(locStreet && (!street || !(locStreet.startsWith(street) || street.startsWith(locStreet)))) return false;
    const number=this.device.numer_budynku.trim().toLocaleLowerCase('pl');
    const locNumber=hit.numer_budynku.trim().toLocaleLowerCase('pl');
    if(locNumber && (!number || !(locNumber.startsWith(number) || number.startsWith(locNumber)))) return false;
    return true;
  }
  async findOnMap(){
    if(this.device.miejscowosc.trim().length<3){ this.report('Wpisz miejscowość, a potem znajdź lokalizację.','warn'); return; }
    window.clearTimeout(this.locateTimer); this.locateGen++;
    const typed=this.typedAddress();
    await this.run('Szukam lokalizacji…', async()=>{
      const hit=await this.resolveLocation(typed, true);
      if(!this.sameAddress(typed)) return;
      if(!hit){ this.report('Nie znaleziono lokalizacji dla wpisanego adresu.','warn'); return; }
      this.applyResolved(hit);
      this.report('Ustawiono punkt dla tego adresu. Kliknij mapę, żeby go poprawić.','ok');
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
  toggleDay(row:DayHoursRow){
    if(row.on){ row.open=FULL_DAY.open; row.close=FULL_DAY.close; }
    this.syncHours();
  }
  syncHours(){
    const value=encodeDayHours(this.dayHours);
    this.hoursSource=value;
    if(value!==this.device.godziny_dostepnosci){ this.device.godziny_dostepnosci=value; this.changed.emit(); }
  }
  get hoursPreview(){ return validOpeningHours(this.device.godziny_dostepnosci)?formatHours(this.device.godziny_dostepnosci):''; }
  required(f:string){ return AED_COLUMNS.find(c=>c.name===f)?.required==='tak'; }
  error(f:string){return this.showErrors?validateDevice(this.device).find(i=>i.field===f&&i.severity==='error')?.message||'':'';}
  hasError(f:string){return !!this.error(f);}
  message(f:string){return this.showErrors?validateDevice(this.device).find(i=>i.field===f)?.message||'':'';}
}
