import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { delay, of, throwError } from 'rxjs';
import campaign from '../../../../assets/aed/campaign.json';

/** Registered only by main.aed-demo.ts. Never sends API writes to the live portal. */
@Injectable()
export class AedDemoInterceptor implements HttpInterceptor {
  intercept(request:HttpRequest<unknown>,next:HttpHandler){
    const url=request.url;
    if(url.includes('/assets/')||url.startsWith('assets/'))return next.handle(request);
    if(url.includes('/api/aed/'))return next.handle(request);
    const ok=(body:unknown)=>of(new HttpResponse({status:200,body})).pipe(delay(80));
    if(url.includes('/api/client/'))return ok({features:[]});
    if(url.includes('/submissions/generic')){
      if(request.method!=='POST')return ok({data:[]});
      try{const key='aed-demo-submissions';const previous=JSON.parse(localStorage.getItem(key)||'[]');const id=crypto.randomUUID();previous.push({id,createdAt:new Date().toISOString(),body:request.body});localStorage.setItem(key,JSON.stringify(previous));return ok({data:{id,type:'generic-contact-submission',attributes:{status:'demo-saved'}}});}catch{return throwError(()=>new HttpErrorResponse({status:507,error:{message:'Nie udało się zapisać zgłoszenia demonstracyjnego.'}}));}
    }
    if(url.includes('/documents')||url.includes('/images'))return ok({meta:{total_count:0},items:[]});
    if(url.includes('/cms/')||url.includes('/api/v2/pages')){
      if(url.includes('/aed/')||url.includes('daj-impuls'))return ok(campaign);
      if(url.includes('/page/')){
        const rodo=url.includes('/page/rodo');
        return ok({
          id:1,
          title:rodo?'Polityka prywatności i RODO':'Otwarte dane',
          body:rodo
            ? '<p>To jest prototyp na HackNation 2026. Nie wysyła danych osobowych na serwer.</p><p>Lokalizacje AED, które dodasz, zostają tylko w tej przeglądarce. Zamknięcie tej informacji też jest zapamiętywane lokalnie.</p>'
            : '<p>Ta strona portalu nie jest częścią prototypu Misji AED.</p>',
        });
      }
      return ok({id:1,title:'Otwarte dane',body:[],over_login_section_cb:[],footer_nav:{blocks:[{id:'aed-footer',type:'raw_html',children:[],settings:{},value:'<div class="aed-footer"><strong>Dane, które pomagają.</strong><p>Moduł AED · Daj impuls</p><a href="/pl/aed/mapa">Znajdź AED</a> · <a href="/pl/aed/dolacz">Udostępnij dane</a></div>'}]},footer_logos:[],meta:{total_count:0},items:[]});
    }
    if(url.includes('/auth/')||url.includes('/users/me'))return throwError(()=>new HttpErrorResponse({status:401,error:{message:'Demonstracja bez sesji portalu'}}));
    // Safe, read-only stubs for the original portal shell; unknown writes fail explicitly.
    if(request.method!=='GET')return throwError(()=>new HttpErrorResponse({status:503,error:{message:'Ta operacja portalu nie jest dostępna w demonstracji AED.'}}));
    return ok({data:[],meta:{count:0,total:0},links:{},items:[]});
  }
}
