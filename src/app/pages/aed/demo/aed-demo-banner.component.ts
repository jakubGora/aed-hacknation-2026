import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AED_CONFIG, MockAedRepository } from '../aed.repository';
@Component({selector:'aed-demo-banner',standalone:true,imports:[CommonModule,RouterLink],template:`<aside class="aed-demo-banner" *ngIf="config.demo" aria-label="Tryb demonstracyjny"><div><strong>PROTOTYP · HACKNATION 2026</strong><span>Fikcyjne dane AED. Zmiany i zgłoszenia zapisują się tylko w tej przeglądarce.</span></div><div><a routerLink="/pl/aed">Akcja AED</a><a routerLink="/pl/aed/dolacz">Zmień rolę</a><button (click)="reset()">Resetuj demo</button></div></aside>`})
export class AedDemoBannerComponent{config=inject(AED_CONFIG);repo=inject(MockAedRepository);reset(){if(confirm('Przywrócić przykładowe urządzenia i usunąć lokalne zmiany oraz zgłoszenia demo?')){this.repo.reset();sessionStorage.removeItem('aed-demo-editor');localStorage.removeItem('aed-demo-submissions');location.href='/pl/aed';}}}
