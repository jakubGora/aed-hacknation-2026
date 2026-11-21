import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AedRow, DOSTEPNOSC_LABELS, STAN_LABELS, ZRODLO_LABELS } from './aed.models';
import { AED_REPOSITORY } from './aed.repository';
import { formatAddress, formatHours, hasExpiredParts } from './aed.logic';
import { AedMapComponent } from './aed-map.component';
@Component({standalone:true,imports:[CommonModule,RouterLink,AedMapComponent],template:`
 <a routerLink="/pl/aed/mapa">Wróć do wyszukiwarki AED</a><p role="alert" class="aed-alert error" *ngIf="error">{{error}}</p><p *ngIf="loading">Wczytywanie urządzenia…</p>
 <ng-container *ngIf="device as d"><div class="aed-page-heading"><div><p class="aed-eyebrow">KARTA URZĄDZENIA · {{d.id_aed}}</p><h1>{{d.nazwa_miejsca}}</h1><p>{{address(d)}}, {{d.kod_pocztowy}} {{d.miejscowosc}}</p></div><span class="aed-badge">{{access[d.dostepnosc]}}</span></div>
 <div class="aed-alert warning" *ngIf="expired(d)">Upłynął zapisany termin baterii, elektrod lub przeglądu. Informacja wymaga sprawdzenia przez dysponenta.</div>
 <div class="aed-detail-layout"><section><h2>Jak znaleźć urządzenie</h2><p class="aed-large-copy">{{d.opis_lokalizacji}}</p><dl class="aed-facts">
   <dt>Godziny dostępności</dt><dd>{{d.dostepnosc==='calodobowa'?'Całodobowo według deklaracji dysponenta':hours(d.godziny_dostepnosci)||'Brak informacji'}}</dd>
   <ng-container *ngIf="d.uwagi_dostepu"><dt>Warunki dostępu</dt><dd>{{d.uwagi_dostepu}}</dd></ng-container>
   <dt>Zgłoszony stan</dt><dd>{{states[d.stan_urzadzenia]}}</dd>
   <dt>Ostatnia weryfikacja</dt><dd>{{d.data_weryfikacji||'Brak informacji'}}</dd>
   <dt>Numer seryjny</dt><dd>{{d.numer_seryjny}}</dd>
   <dt>Dysponent</dt><dd>{{d.nazwa_dysponenta}} · REGON {{d.regon_dysponenta}}</dd>
   <dt>Źródło danych</dt><dd>{{sources[d.zrodlo_danych]}}</dd>
   <dt>Aktualizacja rekordu</dt><dd>{{d.data_aktualizacji|date:'dd.MM.yyyy HH:mm'}}</dd>
 </dl><details><summary>Terminy serwisowe</summary><dl class="aed-facts"><dt>Bateria</dt><dd>{{d.data_waznosci_baterii||'Brak daty'}}</dd><dt>Elektrody</dt><dd>{{d.data_waznosci_elektrod||'Brak daty'}}</dd><dt>Przegląd</dt><dd>{{d.data_przegladu||'Brak daty'}}</dd><dt>Współrzędne (WGS84)</dt><dd>{{d.szerokosc_geograficzna}}, {{d.dlugosc_geograficzna}}</dd><dt>Kod TERYT gminy</dt><dd>{{d.teryt_gminy||'Brak'}}</dd></dl></details></section><aed-map [devices]="[d]" [selected]="d.id_aed"/></div>
 <p class="aed-note">Dane demonstracyjne. Data aktualizacji rekordu nie jest datą sprawdzenia urządzenia w terenie.</p></ng-container>
`})
export class AedDetailComponent implements OnInit{
  repo=inject(AED_REPOSITORY);route=inject(ActivatedRoute);device?:AedRow;loading=true;error='';access=DOSTEPNOSC_LABELS;states=STAN_LABELS;sources=ZRODLO_LABELS;expired=hasExpiredParts;address=formatAddress;hours=formatHours;
  ngOnInit(){const id=this.route.snapshot.paramMap.get('id');this.repo.listPublic().subscribe({next:ds=>{this.device=ds.find(d=>d.id_aed===id);this.loading=false;if(!this.device)this.error='Nie znaleziono opublikowanego urządzenia.';},error:e=>{this.error=e.message;this.loading=false;}});}
}
