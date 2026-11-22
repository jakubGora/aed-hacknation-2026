import { Injectable } from '@angular/core';
import { HttpErrorResponse, HttpHandler, HttpInterceptor, HttpRequest, HttpResponse } from '@angular/common/http';
import { delay, of, throwError } from 'rxjs';
import campaign from '../../../../assets/aed/campaign.json';

/** Stub CMS/shell API for the AED SPA entry (`main.aed-demo.ts`). Auth and `/api/aed` go through the proxy. */
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
      try{const key='aed-demo-submissions';const previous=JSON.parse(localStorage.getItem(key)||'[]');const id=crypto.randomUUID();previous.push({id,createdAt:new Date().toISOString(),body:request.body});localStorage.setItem(key,JSON.stringify(previous));return ok({data:{id,type:'generic-contact-submission',attributes:{status:'demo-saved'}}});}catch{return throwError(()=>new HttpErrorResponse({status:507,error:{message:'Nie udało się zapisać zgłoszenia.'}}));}
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
            ? '<p>Zbiór lokalizacji AED nie zawiera danych osobowych osób korzystających z mapy.</p>'
            : '<p>Ta strona nie zawiera treści o urządzeniach AED.</p>',
        });
      }
      return ok({id:1,title:'Otwarte dane',body:[],over_login_section_cb:[],footer_nav:{blocks:[]},footer_logos:[],meta:{total_count:0},items:[]});
    }
    if(url.includes('/auth/')||url.includes('/users/me'))return next.handle(request);
    if(request.method!=='GET')return throwError(()=>new HttpErrorResponse({status:503,error:{message:'Ta operacja nie jest teraz dostępna.'}}));
    return ok({data:[],meta:{count:0,total:0},links:{},items:[]});
  }
}
