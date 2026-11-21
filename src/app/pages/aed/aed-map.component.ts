import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output, PLATFORM_ID, ViewChild } from '@angular/core';
import { LeafletService } from '@app/services/leflet.service';
import type { Map, LayerGroup } from 'leaflet';
import { AedRow } from './aed.models';
type Located = AedRow & { szerokosc_geograficzna: number; dlugosc_geograficzna: number };
@Component({selector:'aed-map',standalone:true,template:`<div #map class="aed-map" role="region" aria-label="Mapa urządzeń AED. Te same informacje są dostępne na liście obok."></div><p class="aed-map-caption">Podkład: OpenStreetMap. Punkty demonstracyjne nie potwierdzają lokalizacji rzeczywistych AED.</p>`,providers:[LeafletService]})
export class AedMapComponent implements AfterViewInit,OnChanges,OnDestroy {
  @ViewChild('map',{static:true}) element!:ElementRef;@Input()devices:AedRow[]=[];@Input()selected='';@Output()selectDevice=new EventEmitter<string>();
  leaflet=inject(LeafletService);platform=inject(PLATFORM_ID);zone=inject(NgZone);map?:Map;layer?:LayerGroup;
  ngAfterViewInit(){if(!isPlatformBrowser(this.platform))return;this.map=this.leaflet.createMap(this.element,{center:[53.1235,18.0084],zoom:14,scrollWheelZoom:false});this.leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',maxZoom:19}).addTo(this.map);this.layer=this.leaflet.layerGroup().addTo(this.map);this.draw();}
  ngOnChanges(){this.draw();}
  private draw(){
    if(!this.map||!this.layer)return;
    this.layer.clearLayers();
    const valid=this.devices.filter((d):d is Located=>Number.isFinite(d.szerokosc_geograficzna)&&Number.isFinite(d.dlugosc_geograficzna));
    const point=(d:Located):[number,number]=>[d.szerokosc_geograficzna,d.dlugosc_geograficzna];
    for(const d of valid){
      const active=this.selected===d.id_aed;
      const down=d.stan_urzadzenia==='niesprawne';
      const marker=this.leaflet.marker(point(d),{icon:this.leaflet.divIcon({className:`aed-pin${active?' is-active':''}${down?' is-down':''}`,iconSize:[32,28],iconAnchor:[16,26],html:''}),keyboard:true,alt:d.nazwa_miejsca}).addTo(this.layer);
      const label=document.createElement('span');label.textContent=d.nazwa_miejsca;marker.bindTooltip(label);
      marker.on('click',()=>this.zone.run(()=>this.selectDevice.emit(d.id_aed)));
    }
    if(!valid.length)return;
    const current=valid.find(d=>d.id_aed===this.selected);
    if(current)this.map.panTo(point(current));else this.map.fitBounds(valid.map(point),{padding:[35,35],maxZoom:15});
  }
  ngOnDestroy(){this.map?.remove();}
}
