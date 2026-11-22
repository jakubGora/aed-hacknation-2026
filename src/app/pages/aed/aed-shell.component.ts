import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { LoginService } from '@app/services/login-service';
import { UserService } from '@app/services/user.service';
import { AED_CONFIG } from './aed.repository';

@Component({standalone:true,imports:[CommonModule,RouterLink,RouterLinkActive,RouterOutlet],template:`
 <div class="aed-module"><div class="container"><div class="aed-module-bar"><a routerLink="/pl/aed/mapa" class="aed-wordmark"><img src="/assets/aed/mapa-aed-logo.png" alt="Mapa AED" width="270" height="95"/></a><nav aria-label="Mapa AED"><a routerLink="/pl/aed/mapa" routerLinkActive="active">Znajdź AED</a><a *ngIf="!loggedIn" routerLink="/pl/aed/dolacz" routerLinkActive="active">Zgłoś AED</a><a *ngIf="loggedIn" routerLink="/pl/aed/panel" routerLinkActive="active">Moje urządzenia</a></nav></div><router-outlet/></div></div>
`})
export class AedShellComponent implements OnInit {
  private login=inject(LoginService);private users=inject(UserService);private router=inject(Router);private config=inject(AED_CONFIG);loggedIn=false;
  ngOnInit(){this.refresh();this.login.loggedIn.subscribe(()=>this.refresh());this.router.events.pipe(filter(e=>e instanceof NavigationEnd)).subscribe(()=>this.refresh());}
  private refresh(){this.loggedIn=this.users.isLoggedIn()||(this.config.demo&&sessionStorage.getItem('aed-demo-editor')==='yes');}
}

@Component({standalone:true,imports:[CommonModule,RouterLink],template:`
 <ng-container *ngIf="ready&&!loggedIn">
  <div class="aed-page-heading"><div><p class="aed-eyebrow">DOŁĄCZ DO AKCJI</p><h1>Uderz w serce informacji!</h1><p>Twoja organizacja ma AED? Udostępnij informacje o nim. Pomóż rozwijać mapę punktów z AED aby jeszcze lepiej chronić ludzkie życie.</p></div></div>
  <div class="aed-join-grid"><section class="aed-join-option"><h2>Zostań dostawcą danych</h2><p>Skorzystaj z formularza kontaktowego dane.gov.pl. Wybierz założenie profilu dostawcy i podaj nazwę organizacji, służbowy e-mail oraz informację o posiadanych urządzeniach AED.</p><a class="aed-button" routerLink="/pl/contact" [queryParams]="{context:'aed'}">Zgłoś organizację</a><button *ngIf="config.demo" class="aed-button secondary" type="button" (click)="enter()" style="margin-top:16px">Wejdź jako dysponent (demo)</button></section></div>
 </ng-container>
`})
export class AedJoinComponent implements OnInit {
  config=inject(AED_CONFIG);router=inject(Router);private users=inject(UserService);loggedIn=false;ready=false;
  ngOnInit(){this.loggedIn=this.users.isLoggedIn()||(this.config.demo&&sessionStorage.getItem('aed-demo-editor')==='yes');this.ready=true;if(this.loggedIn)this.router.navigate(['/pl/aed/panel']);}
  enter(){sessionStorage.setItem('aed-demo-editor','yes');this.router.navigate(['/pl/aed/panel']);}
}
