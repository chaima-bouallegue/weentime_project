import { CommonModule } from '@angular/common';
import { DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, ViewEncapsulation, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  LucideAngularModule,
  Play,
  Square,
  TrendingUp,
  Users,
} from 'lucide-angular';
import { catchError, forkJoin, interval, of, startWith, Subscription, switchMap } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { ToastService } from '../../../core/services/toast.service';
import { AttendanceCardComponent } from '../../../shared/attendance/attendance-card.component';
import { formatLocalTime } from '../../../core/utils/date-time.util';
import { PointageEntry, PointageLocation, PointageStats, PointageType } from './pointage.models';
import { PointageService } from './pointage.service';

interface PointageMapPoint {
  type: PointageType;
  latitude: number;
  longitude: number;
  timestamp: string;
  label: string;
  location: PointageLocation | null;
}

@Component({
  selector: 'app-employee-pointage',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule, AttendanceCardComponent],
  templateUrl: './employee-pointage.component.html',
  styleUrls: ['./employee-pointage.component.scss'],
  encapsulation: ViewEncapsulation.None,
})
export class EmployeePointageComponent implements OnInit, OnDestroy {
  private readonly pointageService = inject(PointageService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly assistantSync = inject(AssistantSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private pointageMap?: ElementRef<HTMLDivElement>;
  private leaflet?: typeof import('leaflet');
  private map?: import('leaflet').Map;
  private markerLayer?: import('leaflet').LayerGroup;

  @ViewChild('pointageMap')
  set pointageMapElement(element: ElementRef<HTMLDivElement> | undefined) {
    this.pointageMap = element;
    if (element) {
      setTimeout(() => void this.renderMap(), 0);
    } else {
      this.destroyMap();
    }
  }

  readonly iconClock = Clock;
  readonly iconCalendar = Calendar;
  readonly iconCheck = CheckCircle;
  readonly iconAlert = AlertCircle;
  readonly iconPlay = Play;
  readonly iconSquare = Square;
  readonly iconTrend = TrendingUp;
  readonly iconActivity = Activity;
  readonly iconUsers = Users;

  readonly currentTime = signal<string>('00:00:00');
  readonly currentDate = signal<string>('');
  readonly stats = signal<PointageStats | null>(null);
  readonly history = signal<PointageEntry[]>([]);
  readonly statusMessage = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly isDayOff = signal(false);

  readonly attendanceState = this.pointageService.attendanceState;
  readonly checkInTime = this.pointageService.checkInTime;
  readonly checkOutTime = this.pointageService.checkOutTime;
  readonly serviceError = this.pointageService.lastError;
  readonly todaySummary = this.pointageService.todaySummary;
  readonly gpsStatus = this.pointageService.gpsStatus;
  readonly gpsError = this.pointageService.gpsError;
  readonly sessionDuration = this.pointageService.sessionDuration;
  readonly isCheckedIn = this.pointageService.isCheckedIn;

  readonly role = computed(() => this.resolveRole(this.authService.currentUser()?.roles?.[0] ?? this.authService.currentUser()?.role));
  readonly roleLabel = computed(() => {
    switch (this.role()) {
      case 'ADMIN':
        return 'ADMINISTRATEUR';
      case 'RH':
        return 'RESSOURCES HUMAINES';
      case 'MANAGER':
        return 'MANAGER';
      default:
        return 'COLLABORATEUR';
    }
  });

  readonly isAdminOrRh = computed(() => this.role() === 'ADMIN' || this.role() === 'RH');
  readonly isEmployeeOrManager = computed(() => this.role() === 'EMPLOYEE' || this.role() === 'MANAGER');
  readonly showManagerTeamShortcut = computed(() => this.role() === 'MANAGER');

  readonly dailyDuration = computed(() => {
    if (this.attendanceState() === 'ACTIVE') {
      return this.sessionDuration();
    }
    return this.formatMinutesToClock(this.stats()?.minutesAujourdhui ?? 0);
  });

  readonly currentDateTimeFormatted = computed(() => `${this.currentDate()} - ${this.currentTime().slice(0, 5)}`);
  readonly blockReason = computed(() => this.todaySummary()?.reasonIfBlocked ?? null);
  readonly scheduleLabel = computed(() => {
    const start = this.todaySummary()?.scheduledStart;
    const end = this.todaySummary()?.scheduledEnd;
    return start && end ? `${start.slice(0, 5)} - ${end.slice(0, 5)}` : 'Horaire non defini';
  });
  readonly overtimePreviewLabel = computed(() => `${Math.max(Number(this.todaySummary()?.overtimePreview ?? 0), 0)} min`);
  readonly locationStatusLabel = computed(() => {
    const summary = this.todaySummary();
    const location = this.formatLocationLabel(this.resolveLatestLocation())
      ?? this.asText(summary?.checkOutLocationLabel)
      ?? this.asText(summary?.checkInLocationLabel);
    if (location) {
      return `📍 ${location}`;
    }

    switch (this.gpsStatus()) {
      case 'captured':
        return 'Position GPS capturee, adresse en attente';
      case 'requesting':
        return 'Capture GPS en cours...';
      case 'denied':
        return 'GPS refuse';
      case 'unavailable':
        return 'GPS indisponible';
      default:
        return 'GPS pret';
    }
  });
  readonly latestLocation = computed(() => this.resolveLatestLocation());
  readonly latestLocationLabel = computed(() => {
    const structured = this.formatLocationLabel(this.latestLocation());
    if (structured) {
      return structured;
    }

    const summary = this.todaySummary();
    const summaryLocation = this.asText(summary?.checkOutLocationLabel) ?? this.asText(summary?.checkInLocationLabel);
    if (summaryLocation) {
      return summaryLocation;
    }

    const latestLog = this.history().find(log => this.asText(log.location) || this.asText(log.address));
    return latestLog ? (this.asText(latestLog.location) ?? this.asText(latestLog.address)) : null;
  });
  readonly latestCoordinatesLabel = computed(() => this.formatLocationCoordinates(this.latestLocation()));
  readonly hasGpsLocation = computed(() => this.mapPoints().length > 0);

  private clockSub?: Subscription;
  private statsSub?: Subscription;

  ngOnInit(): void {
    this.updateDate();
    this.startClock();
    this.startStatsPolling();
    this.refreshOverview();

    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        const tool = event.actionResult?.tool;
        if (!event.actionResult?.executed || (tool !== 'clock_in' && tool !== 'clock_out')) {
          return;
        }

        this.statusMessage.set(null);
        this.refreshOverview();
      });
  }

  ngOnDestroy(): void {
    this.clockSub?.unsubscribe();
    this.statsSub?.unsubscribe();
    this.destroyMap();
  }

  onCheckIn(): void {
    if (this.isLoading()) {
      return;
    }

    if (this.attendanceState() !== 'NOT_STARTED' || this.todaySummary()?.canCheckIn === false) {
      const msg = this.resolveCheckInBlockedMessage();
      this.statusMessage.set(msg);
      this.toast.warning(msg);
      return;
    }

    this.performPointageAction(true);
  }

  onCheckOut(): void {
    if (this.isLoading() || this.attendanceState() !== 'ACTIVE') {
      return;
    }

    this.performPointageAction(false);
  }

  onRefresh(): void {
    if (this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.statusMessage.set(null);
    this.refreshOverview(() => this.isLoading.set(false));
  }

  formatTime(value: string | null): string {
    return formatLocalTime(value);
  }

  statusLabel(): string {
    switch (this.attendanceState()) {
      case 'ACTIVE':
        return 'Session démarrée';
      case 'CLOSED':
        return 'Journée clôturée';
      case 'ON_LEAVE':
        return 'Conge approuve';
      case 'HOLIDAY':
        return 'Jour ferie';
      case 'AUTO_CLOSED':
        return 'Sortie auto-cloturee';
      case 'ERROR':
        return 'Synchronisation requise';
      default:
        return 'Aucun pointage aujourd’hui';
    }
  }

  dayStatusLabel(status: string): string {
    switch (status) {
      case 'RETARD':
        return 'Retard';
      case 'ABSENT':
        return 'Absent';
      case 'OFF':
        return 'Repos';
      default:
        return 'OK';
    }
  }

  dayStatusClass(status: string): string {
    switch (status) {
      case 'RETARD':
        return 'status-chip status-retard';
      case 'ABSENT':
        return 'status-chip status-absent';
      case 'OFF':
        return 'status-chip status-off';
      default:
        return 'status-chip status-ok';
    }
  }

  private updateDate(): void {
    this.currentDate.set(
      new Date().toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    );
  }

  private startClock(): void {
    this.clockSub = interval(1000)
      .pipe(startWith(0))
      .subscribe(() => {
        this.currentTime.set(
          new Date().toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        );
      });
  }

  private startStatsPolling(): void {
    this.statsSub = interval(60_000)
      .pipe(switchMap(() => this.pointageService.getWeeklyStats()))
      .subscribe(data => {
        this.stats.set(data);
        this.evaluateDayOff(data);
      });
  }

  private evaluateDayOff(data: PointageStats | null): void {
    if (!data?.joursParStatus) {
      return;
    }

    const todayAbbr = new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const todayStatus = data.joursParStatus.find(item => item.jour === todayAbbr);

    if (todayStatus?.statut === 'OFF') {
      this.isDayOff.set(true);
    } else if (!this.isLoading()) {
      this.isDayOff.set(false);
    }
  }

  private refreshOverview(onSettled?: () => void): void {
    this.pointageService.loadTodayStatus().pipe(
      switchMap(() => forkJoin({
        history: this.pointageService.getTodayPointages().pipe(catchError(() => of([] as PointageEntry[]))),
        stats: this.pointageService.getWeeklyStats().pipe(catchError(() => of(null)))
      })),
      catchError(() => of({ history: [] as PointageEntry[], stats: null as PointageStats | null }))
    ).subscribe(({ history, stats }) => {
      this.history.set(history);
      this.stats.set(stats);
      this.evaluateDayOff(stats);
      setTimeout(() => void this.renderMap(), 0);
      onSettled?.();
    });
  }

  private performPointageAction(isStarting: boolean): void {
    this.isLoading.set(true);
    this.statusMessage.set(null);

    const request$ = isStarting ? this.pointageService.checkIn() : this.pointageService.checkOut();

    request$.subscribe({
      next: () => {
        this.toast.success(isStarting ? 'Session démarrée' : 'Journée clôturée');
        this.isDayOff.set(false);
        const gpsWarning = this.gpsError();
        if (gpsWarning) {
          this.statusMessage.set(gpsWarning);
          this.toast.warning(gpsWarning);
        }
        this.refreshOverview(() => this.isLoading.set(false));
      },
      error: err => {
        if (this.pointageService.isSessionAlreadyOpenError(err)) {
          const msg = this.pointageService.toFrenchError(err);
          this.statusMessage.set(msg);
          this.toast.warning(msg);
          this.refreshOverview(() => this.isLoading.set(false));
          return;
        }

        const msg = this.pointageService.toFrenchError(err);
        const normalizedMsg = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

        if (normalizedMsg.includes('conge approuve')) {
          this.isDayOff.set(true);
        }

        this.statusMessage.set(msg);
        this.toast.error(msg);
        this.isLoading.set(false);
      },
    });
  }

  private resolveCheckInBlockedMessage(): string {
    const summary = this.todaySummary();
    const message = this.asText(summary?.reasonIfBlocked)
      ?? this.asText(summary?.leaveOrHolidayInfo)
      ?? this.asText(summary?.latestAlert);

    if (message) {
      return message;
    }

    switch (this.attendanceState()) {
      case 'ACTIVE':
        return 'Vous avez deja pointe votre entree aujourd hui.';
      case 'CLOSED':
        return 'Votre journee de pointage est deja cloturee.';
      case 'ON_LEAVE':
        return 'Vous ne pouvez pas pointer aujourd hui car vous etes en conge approuve.';
      case 'HOLIDAY':
        return 'Vous ne pouvez pas pointer aujourd hui car c est un jour ferie.';
      case 'AUTO_CLOSED':
        return 'Votre session precedente a ete cloturee automatiquement.';
      default:
        return 'Le pointage entree n est pas disponible pour le moment.';
    }
  }

  private formatMinutesToClock(minutes: number): string {
    const safeMinutes = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(safeMinutes / 60);
    const mins = safeMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:00`;
  }

  private resolveRole(value: string | null | undefined): 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE' {
    const normalized = String(value ?? '').trim().toUpperCase();
    const role = normalized.startsWith('ROLE_') ? normalized.substring('ROLE_'.length) : normalized;

    if (role === 'ADMIN' || role === 'RH' || role === 'MANAGER') {
      return role;
    }

    return 'EMPLOYEE';
  }

  private asText(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  mapPoints(): PointageMapPoint[] {
    const points: PointageMapPoint[] = [];
    const checkIn = this.findPointForType('ENTREE');
    const checkOut = this.findPointForType('SORTIE');

    if (checkIn) {
      points.push(checkIn);
    }
    if (checkOut) {
      points.push(checkOut);
    }

    return points;
  }

  timelineLocationLabel(log: PointageEntry): string | null {
    return this.formatLocationLabel(log.locationDetails)
      ?? this.asText(log.location)
      ?? this.asText(log.address);
  }

  timelineCoordinateLabel(log: PointageEntry): string | null {
    return this.formatLocationCoordinates(log.locationDetails)
      ?? this.formatCoordinates(log.latitude, log.longitude);
  }

  formatLocationLabel(location?: PointageLocation | null): string | null {
    if (!location) {
      return null;
    }

    const city = this.asText(location.city);
    const country = this.asText(location.country);
    if (city && country) {
      return city.toLowerCase() === country.toLowerCase() ? city : `${city}, ${country}`;
    }
    if (city) {
      return city;
    }
    if (country) {
      return country;
    }

    return this.asText(location.region) ?? this.asText(location.address);
  }

  formatLocationCoordinates(location?: PointageLocation | null): string | null {
    return this.formatCoordinates(location?.latitude, location?.longitude);
  }

  private resolveLatestLocation(): PointageLocation | null {
    const summary = this.todaySummary();
    const summaryLocation = this.asLocation(summary?.checkOutLocation)
      ?? this.asLocation(summary?.checkInLocation);
    if (summaryLocation) {
      return summaryLocation;
    }

    const latestLog = this.history().find(log => this.hasCoordinates(log.locationDetails) || this.asText(log.address));
    if (latestLog?.locationDetails) {
      return latestLog.locationDetails;
    }
    if (latestLog) {
      return this.entryLocationFallback(latestLog);
    }
    return null;
  }

  private findPointForType(type: PointageType): PointageMapPoint | null {
    const log = this.history().find(item => item.type === type && this.hasCoordinates(item.locationDetails));
    if (log?.locationDetails?.latitude != null && log.locationDetails.longitude != null) {
      return {
        type,
        latitude: Number(log.locationDetails.latitude),
        longitude: Number(log.locationDetails.longitude),
        timestamp: log.timestamp,
        label: type === 'ENTREE' ? 'Pointage entrée' : 'Pointage sortie',
        location: log.locationDetails,
      };
    }

    const summary = this.todaySummary();
    const summaryLocation = type === 'ENTREE'
      ? this.asLocation(summary?.checkInLocation)
      : this.asLocation(summary?.checkOutLocation);
    if (summaryLocation?.latitude != null && summaryLocation.longitude != null) {
      return {
        type,
        latitude: Number(summaryLocation.latitude),
        longitude: Number(summaryLocation.longitude),
        timestamp: type === 'ENTREE'
          ? String(summary?.['checkIn'] ?? summary?.['heureEntree'] ?? '')
          : String(summary?.['checkOut'] ?? summary?.['heureSortie'] ?? ''),
        label: type === 'ENTREE' ? 'Pointage entrée' : 'Pointage sortie',
        location: summaryLocation,
      };
    }

    return null;
  }

  private entryLocationFallback(log: PointageEntry): PointageLocation | null {
    if (log.latitude == null || log.longitude == null) {
      return null;
    }
    return {
      latitude: log.latitude,
      longitude: log.longitude,
      accuracy: log.accuracy ?? null,
      address: log.address ?? null,
      city: null,
      region: null,
      country: null,
    };
  }

  private asLocation(value: unknown): PointageLocation | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const location = value as PointageLocation;
    if (!this.hasCoordinates(location) && !this.formatLocationLabel(location)) {
      return null;
    }
    return location;
  }

  private hasCoordinates(location?: PointageLocation | null): boolean {
    return Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
  }

  private formatCoordinates(latitude: unknown, longitude: unknown): string | null {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }

  private async renderMap(): Promise<void> {
    if (typeof window === 'undefined' || !this.pointageMap?.nativeElement) {
      return;
    }

    const points = this.mapPoints();
    if (points.length === 0) {
      this.destroyMap();
      return;
    }

    const L = this.leaflet ?? await import('leaflet');
    this.leaflet = L;

    if (!this.map) {
      this.map = L.map(this.pointageMap.nativeElement, {
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

  private markerIcon(type: PointageType): import('leaflet').DivIcon {
    const L = this.leaflet!;
    return L.divIcon({
      className: `pointage-map-marker pointage-map-marker--${type === 'ENTREE' ? 'in' : 'out'}`,
      html: '<span></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  private popupHtml(point: PointageMapPoint): string {
    const location = this.formatLocationLabel(point.location);
    const coordinates = this.formatCoordinates(point.latitude, point.longitude);
    const address = this.asText(point.location?.address);
    const time = this.formatTime(point.timestamp);
    return [
      `<strong>${this.escapeHtml(point.label)} — ${this.escapeHtml(time)}</strong>`,
      location ? `<div>${this.escapeHtml(location)}</div>` : '',
      address && address !== location ? `<small>${this.escapeHtml(address)}</small>` : '',
      coordinates ? `<small>${this.escapeHtml(coordinates)}</small>` : '',
    ].filter(Boolean).join('');
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


