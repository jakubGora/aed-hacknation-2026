import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { UserService } from '@app/services/user.service';
import { AED_CONFIG } from './aed.repository';
import { AedShellComponent } from './aed-shell.component';
export const aedEditorGuard:CanActivateFn=()=>{
  const router=inject(Router);
  const users=inject(UserService);
  const config=inject(AED_CONFIG);
  const ok=users.isLoggedIn()||(config.demo&&sessionStorage.getItem('aed-demo-editor')==='yes');
  return ok||router.createUrlTree(['/pl/aed/dolacz']);
};
export const AED_ROUTES:Routes=[{path:'',component:AedShellComponent,children:[
 {path:'',pathMatch:'full',redirectTo:'!mapa'},
 {path:'!dolacz',loadComponent:()=>import('./aed-shell.component').then(m=>m.AedJoinComponent)},
 {path:'!mapa',loadComponent:()=>import('./aed-public.component').then(m=>m.AedPublicComponent)},
 {path:'!urzadzenia/!:id',loadComponent:()=>import('./aed-detail.component').then(m=>m.AedDetailComponent)},
 {path:'!panel',canActivate:[aedEditorGuard],loadComponent:()=>import('./aed-panel.component').then(m=>m.AedPanelComponent)},
 {path:'!panel/!nowe',canActivate:[aedEditorGuard],loadComponent:()=>import('./aed-editor.component').then(m=>m.AedEditorComponent)},
 {path:'!panel/!:id/!edytuj',canActivate:[aedEditorGuard],loadComponent:()=>import('./aed-editor.component').then(m=>m.AedEditorComponent)},
 {path:'!import',canActivate:[aedEditorGuard],loadComponent:()=>import('./aed-import.component').then(m=>m.AedImportComponent)},
]}];
