import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AED_REPOSITORY } from './aed.repository';
import { AedRow, DOSTEPNOSC_LABELS } from './aed.models';
import { distanceKm, exportCsv, exportJson, formatAddress, hasExpiredParts, today } from './aed.logic';
import { AED_DATASET, datasetXml } from './aed.dataset';
import { AedMapComponent } from './aed-map.component';
import { download } from './aed-panel.component';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterLink,AedMapComponent],template:`
 <div class="aed-page-heading"><div><p class="aed-eyebrow">OTWARTE DANE, BLIŻEJ POMOCY</p><h1>Znajdź urządzenie AED</h1><p>Sprawdź lokalizację, sposób dostępu i datę potwierdzenia informacji.</p></div><button class="aed-button secondary" (click)="locate()" [disabled]="locating">{{locating?'Ustalanie lokalizacji…':'Użyj mojej lokalizacji'}}</button></div>
 <div class="aed-alert" role="status" *ngIf="locationMessage">{{locationMessage}}</div><div class="aed-alert error" role="alert" *ngIf="error">{{error}}</div>
 <div class="aed-filterbar"><div class="aed-field grow"><label for="public-query">Szukaj miejsca lub adresu</label><input id="public-query" type="search" [(ngModel)]="query" (ngModelChange)="selected=''" placeholder="Np. Bydgoszcz, biblioteka, Gdańska"/></div><div class="aed-field"><label for="access-filter">Dostępność</label><select id="access-filter" [(ngModel)]="accessFilter" (ngModelChange)="selected=''"><option value="">Każda dostępność</option><option value="calodobowa">Całodobowo według danych</option><option value="w_godzinach">W określonych godzinach</option><option value="ograniczona">Dostęp ograniczony</option><option value="nieznana">Dostęp niepotwierdzony</option></select></div><label class="aed-checkbox"><input type="checkbox" [(ngModel)]="hideUnavailable"/>Ukryj zgłoszone jako niesprawne</label></div>
 <div class="aed-result-heading"><strong>{{filtered.length}} urządzeń</strong><span>{{originLabel}} · odległość w linii prostej</span></div>
 <div class="aed-explorer"><div class="aed-results"><p *ngIf="loading" role="status">Wczytywanie zbioru…</p><article *ngFor="let d of filtered" class="aed-device-card" [class.selected]="selected===d.id_aed"><div class="aed-card-top"><span class="aed-badge" [class.warning]="d.dostepnosc!=='calodobowa'">{{access[d.dostepnosc]}}</span><span>{{distance(d)}}</span></div><h2><button (click)="selected=d.id_aed">{{d.nazwa_miejsca}}</button></h2><p>{{address(d)}}, {{d.miejscowosc}}</p><p class="aed-directions">{{d.opis_lokalizacji}}</p><p class="aed-warning-text" *ngIf="expired(d)">Upłynął termin elementu urządzenia — wymaga sprawdzenia.</p><div class="aed-card-bottom"><small>Weryfikacja: {{d.data_weryfikacji||'brak informacji'}} · {{d.nazwa_dysponenta}}</small><a [routerLink]="['/pl/aed/urzadzenia',d.id_aed]">Szczegóły</a></div></article><div class="aed-empty" *ngIf="!loading&&!filtered.length"><h2>Brak wyników</h2><p>Zmień nazwę miejsca lub ustawienia filtrów.</p><button class="aed-button secondary" (click)="clear()">Wyczyść filtry</button></div></div><aed-map [devices]="filtered" [selected]="selected" (selectDevice)="selected=$event"/></div>
 <section class="aed-note aed-dataset-box" aria-labelledby="aed-dataset-title">
   <h2 id="aed-dataset-title">Zbiór danych: {{dataset.title.polish}}</h2>
   <p>Jeden wspólny zbiór w dane.gov.pl, uzupełniany przez wielu dysponentów AED. Każdy rekord wskazuje dysponenta (REGON) odpowiedzialnego za dane. {{devices.length}} rekordów · {{dysponentCount}} dysponentów · licencja {{dataset.license}} · aktualizacja codzienna.</p>
   <div class="aed-actions"><button class="aed-button secondary" (click)="downloadCsv()" [disabled]="!devices.length">Pobierz CSV</button><button class="aed-button secondary" (click)="downloadJson()" [disabled]="!devices.length">Pobierz JSON</button><button class="aed-button secondary" (click)="downloadXml()">Metadane XML (import dane.gov.pl)</button></div>
 </section>
 <p class="aed-muted aed-public-note">Godziny i stan pochodzą z deklaracji dysponentów. Nie są informacją o dostępności w czasie rzeczywistym. Prototyp prezentuje wyłącznie fikcyjne dane.</p>
`})
export class AedPublicComponent implements OnInit {
  repo=inject(AED_REPOSITORY);devices:AedRow[]=[];query='';accessFilter='';hideUnavailable=false;selected='';loading=true;locating=false;locationMessage='';error='';origin={lat:53.1235,lon:18.0084};originLabel='Od centrum Bydgoszczy (punkt początkowy)';access=DOSTEPNOSC_LABELS;expired=hasExpiredParts;address=formatAddress;dataset=AED_DATASET;
  ngOnInit(){this.repo.listPublic().subscribe({next:d=>{this.devices=d;this.loading=false;},error:e=>{this.error=e.message;this.loading=false;}});}
  get dysponentCount(){return new Set(this.devices.map(d=>d.regon_dysponenta)).size;}
  get filtered(){const q=this.query.toLowerCase();return this.devices.filter(d=>(`${d.nazwa_miejsca} ${d.miejscowosc} ${formatAddress(d)}`).toLowerCase().includes(q)&&(!this.accessFilter||d.dostepnosc===this.accessFilter)&&(!this.hideUnavailable||d.stan_urzadzenia!=='niesprawne')).sort((a,b)=>distanceKm(this.origin.lat,this.origin.lon,a)-distanceKm(this.origin.lat,this.origin.lon,b));}
  distance(d:AedRow){const n=distanceKm(this.origin.lat,this.origin.lon,d);return Number.isFinite(n)?n<1?Math.round(n*1000)+' m':n.toFixed(1)+' km':'Brak współrzędnych';}
  clear(){this.query='';this.accessFilter='';this.hideUnavailable=false;this.selected='';}
  downloadCsv(){download(exportCsv(this.devices),'aed-polska.csv');}
  downloadJson(){download(exportJson(this.devices),'aed-polska.json','application/json;charset=utf-8');}
  downloadXml(){const last=this.devices.map(d=>d.data_aktualizacji).sort().pop();download(datasetXml(`${location.origin}/api/aed/v1/public`,last?new Date(last):new Date(),today()),'aed-polska-dane-gov.xml','application/xml;charset=utf-8');}
  locate(){if(!navigator.geolocation){this.locationMessage='Twoja przeglądarka nie obsługuje lokalizacji. Użyj wyszukiwania adresu.';return;}this.locating=true;navigator.geolocation.getCurrentPosition(p=>{this.origin={lat:p.coords.latitude,lon:p.coords.longitude};this.originLabel='Od Twojej lokalizacji';this.locating=false;this.locationMessage='Wyniki posortowano według odległości od Ciebie. Lokalizacja nie jest zapisywana.';},()=>{this.locating=false;this.locationMessage='Nie udało się uzyskać lokalizacji. Nadal możesz szukać po nazwie i adresie; odległości liczymy od centrum Bydgoszczy.';},{timeout:10000,maximumAge:60000});}
}
