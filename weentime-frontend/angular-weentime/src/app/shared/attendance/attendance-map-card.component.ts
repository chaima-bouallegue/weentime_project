import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { AlertCircle, LucideAngularModule } from 'lucide-angular';

export type AttendanceMapPointType = 'ENTREE' | 'SORTIE';

export interface AttendanceMapLocation {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}

export interface AttendanceMapPoint {
  type: AttendanceMapPointType;
  timestamp?: string | null;
  label?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  location?: AttendanceMapLocation | null;
}

interface ResolvedMapPoint {
  type: AttendanceMapPointType;
  timestamp?: string | null;
  label: string;
  latitude: number;
  longitude: number;
  location: AttendanceMapLocation | null;
}

@Component({
  selector: 'app-attendance-map-card',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './attendance-map-card.component.html',
  styleUrls: ['./attendance-map-card.component.scss'],
})
export class AttendanceMapCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() points: AttendanceMapPoint[] | null = [];
  @Input() emptyMessage = 'Aucune localisation GPS disponible.';

  readonly iconAlert = AlertCircle;

  private mapCanvas?: ElementRef<HTMLDivElement>;
  private leaflet?: typeof import('leaflet');
  private map?: import('leaflet').Map;
  private markerLayer?: import('leaflet').LayerGroup;
  private viewReady = false;
  private renderToken = 0;

  @ViewChild('mapCanvas')
  set mapCanvasElement(element: ElementRef<HTMLDivElement> | undefined) {
    this.mapCanvas = element;
    if (element) {
      this.scheduleRender();
    } else {
      this.destroyMap();
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.scheduleRender();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    this.scheduleRender();
  }

  ngOnDestroy(): void {
    this.destroyMap();
  }

  hasPoints(): boolean {
    return this.resolvedPoints().length > 0;
  }

  private scheduleRender(): void {
    if (!this.viewReady) {
      return;
    }
    const token = ++this.renderToken;
    setTimeout(() => {
      if (token === this.renderToken) {
        void this.renderMap();
      }
    }, 0);
  }

  private async renderMap(): Promise<void> {
    if (typeof window === 'undefined' || !this.mapCanvas?.nativeElement) {
      return;
    }

    const points = this.resolvedPoints();
    if (points.length === 0) {
      this.destroyMap();
      return;
    }

    const L = this.leaflet ?? await import('leaflet');
    this.leaflet = L;

    if (!this.map) {
      this.map = L.map(this.mapCanvas.nativeElement, {
        zoomControl: false,
        attributionControl: true,
      });
      L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(this.map);
      this.markerLayer = L.layerGroup().addTo(this.map);
    }

    this.markerLayer?.clearLayers();
    const bounds = L.latLngBounds([]);

    points.forEach(point => {
      const latLng = L.latLng(point.latitude, point.longitude);
      bounds.extend(latLng);
      L.marker(latLng, { icon: this.markerIcon(point.type) })
        .bindPopup(this.popupHtml(point))
        .addTo(this.markerLayer!);
    });

    if (points.length > 1) {
      this.map.fitBounds(bounds, { padding: [28, 28], maxZoom: 16 });
    } else {
      this.map.setView([points[0].latitude, points[0].longitude], 16);
    }

    setTimeout(() => this.map?.invalidateSize(), 0);
  }

  private markerIcon(type: AttendanceMapPointType): import('leaflet').DivIcon {
    const L = this.leaflet!;
    return L.divIcon({
      className: `attendance-map-marker attendance-map-marker--${type === 'ENTREE' ? 'in' : 'out'}`,
      html: '<span></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  private popupHtml(point: ResolvedMapPoint): string {
    const typeLabel = point.type === 'ENTREE' ? 'Entrée' : 'Sortie';
    const time = this.formatTime(point.timestamp);
    const location = this.formatLocationLabel(point.location);
    const coordinates = this.formatCoordinates(point.latitude, point.longitude);
    const address = this.clean(point.location?.address);

    return [
      `<strong>${this.escapeHtml(point.label || `Pointage ${typeLabel.toLowerCase()}`)}</strong>`,
      `<div>Type: ${this.escapeHtml(typeLabel)}</div>`,
      time ? `<div>Heure: ${this.escapeHtml(time)}</div>` : '',
      location ? `<div>${this.escapeHtml(location)}</div>` : '',
      address && address !== location ? `<small>${this.escapeHtml(address)}</small>` : '',
      coordinates ? `<small>${this.escapeHtml(coordinates)}</small>` : '',
    ].filter(Boolean).join('');
  }

  private resolvedPoints(): ResolvedMapPoint[] {
    return (this.points ?? [])
      .map(point => this.resolvePoint(point))
      .filter((point): point is ResolvedMapPoint => point !== null);
  }

  private resolvePoint(point: AttendanceMapPoint | null | undefined): ResolvedMapPoint | null {
    if (!point) {
      return null;
    }

    const location = point.location ?? null;
    const latitude = this.toFiniteNumber(location?.latitude) ?? this.toFiniteNumber(point.latitude);
    const longitude = this.toFiniteNumber(location?.longitude) ?? this.toFiniteNumber(point.longitude);
    if (latitude == null || longitude == null) {
      return null;
    }

    return {
      type: point.type,
      timestamp: point.timestamp ?? null,
      label: point.label ?? (point.type === 'ENTREE' ? 'Pointage entrée' : 'Pointage sortie'),
      latitude,
      longitude,
      location,
    };
  }

  private formatLocationLabel(location?: AttendanceMapLocation | null): string | null {
    if (!location) {
      return null;
    }

    const city = this.clean(location.city);
    const country = this.clean(location.country);
    if (city && country) {
      return city.toLowerCase() === country.toLowerCase() ? city : `${city}, ${country}`;
    }
    return city ?? country ?? this.clean(location.region) ?? this.clean(location.address);
  }

  private formatCoordinates(latitude: unknown, longitude: unknown): string | null {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  private formatTime(value: string | null | undefined): string {
    if (!value) {
      return '--:--';
    }
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    const match = value.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : value;
  }

  private toFiniteNumber(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private clean(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private destroyMap(): void {
    this.markerLayer?.clearLayers();
    this.markerLayer = undefined;
    this.map?.remove();
    this.map = undefined;
  }
}
