import { isPlatformBrowser } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, NgZone, OnChanges, OnDestroy, Output, PLATFORM_ID, ViewChild } from '@angular/core';
import { LeafletService } from '@app/services/leflet.service';
import type { LayerGroup, Map } from 'leaflet';
import { AedRow } from './aed.models';

type Located = AedRow & { szerokosc_geograficzna: number; dlugosc_geograficzna: number };
export type MapPoint = { lat: number; lon: number };

@Component({selector:'aed-map',standalone:true,template:`<div #map class="aed-map" role="region" aria-label="Mapa urządzeń AED. Te same informacje są dostępne na liście obok."></div><p class="aed-map-caption">Podkład: OpenStreetMap.</p>`,providers:[LeafletService]})
export class AedMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('map',{static:true}) element!: ElementRef;
  @Input() devices: AedRow[] = [];
  @Input() selected = '';
  @Input() here: MapPoint | null = null;
  @Output() selectDevice = new EventEmitter<string>();
  private leaflet = inject(LeafletService);
  private platform = inject(PLATFORM_ID);
  private zone = inject(NgZone);
  private map?: Map;
  private layer?: LayerGroup;
  private pointsKey = '';
  private hereKey = '';
  private selectedKey = '';

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platform)) return;
    this.map = this.leaflet.createMap(this.element, {center:[53.1235, 18.0084], zoom:13, maxZoom:19, scrollWheelZoom:true});
    this.leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom:19}).addTo(this.map);
    this.layer = this.leaflet.layerGroup().addTo(this.map);
    this.draw();
    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  ngOnChanges() { this.draw(); }

  private draw() {
    if (!this.map || !this.layer) return;
    const valid = this.devices.filter((d): d is Located => Number.isFinite(d.szerokosc_geograficzna) && Number.isFinite(d.dlugosc_geograficzna));
    const pointsKey = valid.map(d => d.id_aed).join(',');
    const hereKey = this.here ? `${this.here.lat.toFixed(5)},${this.here.lon.toFixed(5)}` : '';
    const samePoints = pointsKey === this.pointsKey && hereKey === this.hereKey;
    const sameSelection = this.selected === this.selectedKey;
    if (samePoints && sameSelection) return;
    this.pointsKey = pointsKey;
    this.hereKey = hereKey;
    this.selectedKey = this.selected;
    this.layer.clearLayers();
    const point = (d: Located): [number, number] => [d.szerokosc_geograficzna, d.dlugosc_geograficzna];
    for (const d of valid) {
      const active = this.selected === d.id_aed;
      const down = d.stan_urzadzenia === 'niesprawne';
      const marker = this.leaflet.marker(point(d), {icon:this.leaflet.divIcon({className:`aed-pin${active ? ' is-active' : ''}${down ? ' is-down' : ''}`, iconSize:[32, 28], iconAnchor:[16, 26], html:''}), keyboard:true, alt:d.nazwa_miejsca}).addTo(this.layer);
      const label = document.createElement('span');
      label.textContent = d.nazwa_miejsca;
      marker.bindTooltip(label);
      marker.on('click', () => this.zone.run(() => this.selectDevice.emit(d.id_aed)));
    }
    if (this.here) {
      const marker = this.leaflet.marker([this.here.lat, this.here.lon], {icon:this.leaflet.divIcon({className:'aed-you', iconSize:[18, 18], iconAnchor:[9, 9], html:''}), keyboard:false, alt:'Twoja lokalizacja', zIndexOffset:500}).addTo(this.layer);
      const label = document.createElement('span');
      label.textContent = 'Twoja lokalizacja';
      marker.bindTooltip(label);
    }
    const current = valid.find(d => d.id_aed === this.selected);
    if (current) this.map.setView(point(current), Math.max(this.map.getZoom(), 16));
    else if (!samePoints && this.here) this.map.setView([this.here.lat, this.here.lon], 14);
    else if (!samePoints && valid.length) this.map.fitBounds(valid.map(point), {padding:[35, 35], maxZoom:14});
  }

  ngOnDestroy() { this.map?.remove(); }
}
