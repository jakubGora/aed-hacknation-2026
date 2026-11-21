import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AedFieldsComponent } from './aed-fields.component';
import { AedDevice, Dysponent, EMPTY_DEVICE, StatusRekordu } from './aed.models';
import { AED_CONFIG, AED_REPOSITORY } from './aed.repository';
import { validateDevice } from './aed.logic';
@Component({standalone:true,imports:[CommonModule,FormsModule,RouterLink,AedFieldsComponent],template:`
  <div class="aed-page-heading"><div><p class="aed-eyebrow">PANEL DYSPONENTA AED</p><h1>{{device.id_aed?'Edytuj urządzenie AED':'Dodaj urządzenie AED'}}</h1><p>Dokładna lokalizacja i aktualne dane pomagają dotrzeć do urządzenia.</p><p class="aed-muted" *ngIf="dysponent">Dysponent: <strong>{{dysponent.nazwa}}</strong> · REGON {{dysponent.regon}}</p></div><a class="aed-button secondary" routerLink="/pl/aed/panel">Moje urządzenia</a></div>
  <div class="aed-alert error" role="alert" *ngIf="error">{{error}}</div>
  <p *ngIf="loading" role="status">Wczytywanie urządzenia…</p>
  <form *ngIf="!loading && !notFound" (ngSubmit)="save('published')" novalidate class="aed-editor">
    <aed-fields [device]="device" [showErrors]="attempted" />
    <div class="aed-alert" *ngIf="attempted&&warningCount">Pozostały informacje do uzupełnienia: {{warningCount}}. Możesz opublikować rekord z jawnymi brakami i wrócić do nich później.</div>
    <label class="aed-checkbox"><input type="checkbox" [(ngModel)]="confirmed" name="confirmed"/>Potwierdzam zgodność wprowadzonych danych z posiadanymi informacjami.</label>
    <p class="aed-muted" *ngIf="config.demo">Zapis dotyczy wyłącznie demonstracyjnego zbioru w tej przeglądarce.</p>
    <div class="aed-actions"><button type="submit" class="aed-button" [disabled]="saving">{{saving?'Zapisywanie…':'Zapisz i opublikuj w zbiorze'}}</button><button type="button" class="aed-button secondary" (click)="save('draft')" [disabled]="saving">{{device.status==='published'&&device.id_aed?'Wycofaj do szkicu':'Zapisz szkic'}}</button><a routerLink="/pl/aed/panel">Anuluj</a></div>
  </form>
`})
export class AedEditorComponent implements OnInit {
  repo=inject(AED_REPOSITORY);config=inject(AED_CONFIG);route=inject(ActivatedRoute);router=inject(Router);
  device:AedDevice={...EMPTY_DEVICE,history:[]};dysponent:Dysponent|null=null;attempted=false;saving=false;loading=false;notFound=false;confirmed=false;error='';
  get warningCount(){return validateDevice(this.device).filter(i=>i.severity==='warning').length;}
  ngOnInit(){
    this.repo.context().subscribe(c=>this.dysponent=c.dysponent);
    const id=this.route.snapshot.paramMap.get('id');
    if(!id)return;
    this.loading=true;
    this.repo.listMine().subscribe({next:rows=>{const d=rows.find(d=>d.id_aed===id);this.loading=false;if(d)this.device=structuredClone(d);else {this.notFound=true;this.error='Nie znaleziono urządzenia u Twojego dysponenta.';}},error:e=>{this.loading=false;this.notFound=true;this.error=e.message;}});
  }
  save(status:StatusRekordu){
    this.attempted=true;this.error='';
    if(status==='published'&&validateDevice(this.device).some(i=>i.severity==='error'))return;
    if(status==='published'&&!this.confirmed){this.error='Potwierdź zgodność danych przed publikacją.';return;}
    this.saving=true;
    this.repo.save({...this.device,status}).subscribe({next:()=>this.router.navigate(['/pl/aed/panel'],{queryParams:{saved:status}}),error:e=>{this.saving=false;this.error=e.error?.message||e.message||'Nie udało się zapisać danych. Spróbuj ponownie.';}});
  }
}
