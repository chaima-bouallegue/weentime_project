import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, HostListener, Input, inject, signal, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ChevronLeft, ChevronRight } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { AnomalyRecord, AnomalyRisk } from '../../../core/services/ml-anomaly.service';
import { ToastService } from '../../../core/services/toast.service';
import { CommunicationApiService } from '../../../features/communication/services/communication-api.service';
import { AnomalyAction, AnomalyAlertCardComponent } from '../../components/anomaly-alert-card/anomaly-alert-card.component';
import { AiRiskBadgeComponent } from '../../components/ai-risk-badge/ai-risk-badge.component';


type AnomalyFeedLayout = 'list' | 'cards';
type AnomalyFeedScope = 'RH' | 'MANAGER' | 'ADMIN';
type AnomalyRiskFilter = 'ALL' | AnomalyRisk;
type AnomalySort = 'SCORE_DESC' | 'DATE_DESC' | 'EMPLOYEE_ASC';
type IgnoreReason = 'Faux positif' | 'Situation déjà traitée' | 'Employé contacté' | 'Autre';

interface FeatureSnapshotItem {
  key: string;
  label: string;
  value: string;
}

interface DetailReasonItem {
  label: string;
  description: string;
  value: string | null;
  expected: string | null;
}

const SNAPSHOT_LABELS: Record<string, string> = {
  arrival_hour: 'Heure arrivée',
  departure_hour: 'Heure sortie',
  worked_hours: 'Heures travaillées',
  late_minutes: 'Minutes de retard',
  missing_checkout: 'Sortie manquante',
  night_activity: 'Activité de nuit',
  rapid_session: 'Session rapide',
  overtime_excess: 'Heures sup. excessives',
  is_absent: 'Absent',
  is_late: 'En retard',
};

const ATTENDANCE_SNAPSHOT_LABELS: Record<string, string> = {
  scheduledStart: 'Début prévu',
  scheduledEnd: 'Fin prévue',
  checkIn: 'Entrée',
  checkOut: 'Sortie',
  workedMinutes: 'Temps travaillé',
  lateMinutes: 'Retard',
  missingCheckout: 'Sortie manquante',
  isAbsent: 'Absent',
  isWeekend: 'Week-end',
  overtimeMinutes: 'Heures supplémentaires',
  location: 'Lieu',
};

const IGNORE_REASONS: IgnoreReason[] = [
  'Faux positif',
  'Situation déjà traitée',
  'Employé contacté',
  'Autre',
];

@Component({
  selector: 'ui-ai-anomaly-feed',
  standalone: true,
  imports: [CommonModule, FormsModule, AnomalyAlertCardComponent, AiRiskBadgeComponent, LucideAngularModule],
  templateUrl: './ai-anomaly-feed.component.html',
  styleUrls: ['./ai-anomaly-feed.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiAnomalyFeedComponent implements AfterViewInit {
  private readonly toast = inject(ToastService);
  private readonly communicationApi = inject(CommunicationApiService);

  @ViewChild('cardGrid') cardGrid?: ElementRef<HTMLDivElement>;
  readonly showLeftBtn = signal(false);
  readonly showRightBtn = signal(false);
  readonly iconChevronLeft = ChevronLeft;
  readonly iconChevronRight = ChevronRight;

  @Input() loading = false;
  @Input() title = 'Anomalies de présence';
  @Input() subtitle = 'Détection IA · score normalisé';
  @Input() emptyMessage = "Aucune anomalie détectée aujourd'hui.";
  @Input() ignoredEmptyMessage = 'Aucune anomalie active à afficher.';
  @Input() ignoredEmptySecondary = 'Les anomalies ignorées restent disponibles dans l’historique local de cette session.';
  @Input() set maxVisible(value: number | string | null | undefined) {
    const parsed = Number(value);
    this._maxVisible = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : Number.POSITIVE_INFINITY;
    this.showAll.set(false);
  }
  get maxVisible(): number {
    return Number.isFinite(this._maxVisible) ? this._maxVisible : 0;
  }
  @Input() layout: AnomalyFeedLayout = 'list';
  private _maxVisible = 4;

  @Input() set scope(value: AnomalyFeedScope | string | null | undefined) {
    const normalized = String(value || 'RH').toUpperCase();
    this._scope = normalized === 'ADMIN' || normalized === 'MANAGER' ? normalized : 'RH';
    this.loadIgnoredKeys();
  }
  get scope(): AnomalyFeedScope {
    return this._scope;
  }
  private _scope: AnomalyFeedScope = 'RH';

  @Input() set anomalies(value: AnomalyRecord[] | null | undefined) {
    const list = Array.isArray(value) ? value : [];
    const seen = new Set<string>();
    this._anomalies = [...list]
      .filter(a => a && Number.isFinite(a.score))
      .sort((a, b) => b.score - a.score)
      .filter(a => {
        const key = this.anomalyKey(a);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    this.loadIgnoredKeys();
    setTimeout(() => this.updateScrollButtons(), 200);
  }
  get anomalies(): AnomalyRecord[] {
    return this._anomalies;
  }
  private _anomalies: AnomalyRecord[] = [];

  @Input() totalAnomalies = 0;
  @Input() critical = 0;
  @Input() high = 0;
  @Input() medium = 0;

  readonly expanded = signal<string | null>(null);
  readonly collapsed = signal(false);
  readonly ignoreReasons = IGNORE_REASONS;
  riskFilter: AnomalyRiskFilter = 'ALL';
  sortMode: AnomalySort = 'SCORE_DESC';
  readonly showAll = signal(false);

  detailsAnomaly: AnomalyRecord | null = null;
  contactAnomaly: AnomalyRecord | null = null;
  ignoreCandidate: AnomalyRecord | null = null;
  contactMessage = '';
  ignoreReason: IgnoreReason = 'Faux positif';
  customIgnoreReason = '';
  pendingAction: 'contact' | 'prepare' | 'ignore' | null = null;
  private ignoredKeys = new Set<string>();

  get activeAnomalies(): AnomalyRecord[] {
    return this._anomalies.filter(a => !this.ignoredKeys.has(this.anomalyKey(a)));
  }

  get visibleAnomalies(): AnomalyRecord[] {
    if (this.collapsed()) return [];
    const limit = this.showAll() || !Number.isFinite(this._maxVisible)
      ? this.filteredAnomalies.length
      : this._maxVisible;
    return this.filteredAnomalies.slice(0, limit);
  }

  get overflowCount(): number {
    return Math.max(0, this.filteredAnomalies.length - this.visibleAnomalies.length);
  }

  get filteredAnomalies(): AnomalyRecord[] {
    const filtered = this.riskFilter === 'ALL'
      ? [...this.activeAnomalies]
      : this.activeAnomalies.filter(anomaly => anomaly.risk === this.riskFilter);
    return filtered.sort((left, right) => {
      if (this.sortMode === 'DATE_DESC') {
        return right.date.localeCompare(left.date) || right.score - left.score;
      }
      if (this.sortMode === 'EMPLOYEE_ASC') {
        return left.employeeName.localeCompare(right.employeeName, 'fr', { sensitivity: 'base' });
      }
      return right.score - left.score || right.date.localeCompare(left.date);
    });
  }

  get displayedCount(): number {
    return this.visibleAnomalies.length;
  }

  get controlsVisible(): boolean {
    return this.scope === 'ADMIN' && this.layout === 'cards' && this.activeTotal > 0;
  }

  get activeTotal(): number {
    return this.activeAnomalies.length;
  }

  get activeCritical(): number {
    return this.activeAnomalies.filter(a => a.risk === 'CRITICAL').length;
  }

  get activeHigh(): number {
    return this.activeAnomalies.filter(a => a.risk === 'HIGH').length;
  }

  get activeMedium(): number {
    return this.activeAnomalies.filter(a => a.risk === 'MEDIUM').length;
  }

  get activeLow(): number {
    return this.activeAnomalies.filter(a => a.risk === 'LOW').length;
  }

  get hasIgnoredAll(): boolean {
    return this._anomalies.length > 0 && this.activeAnomalies.length === 0;
  }

  get contactTitle(): string {
    if (this.scope === 'ADMIN') return 'Préparer un message au RH ou à l’employé';
    if (this.scope === 'MANAGER') return 'Contacter l’employé';
    return 'Contacter le collaborateur';
  }

  get canSendContact(): boolean {
    return Number.isFinite(this.contactAnomaly?.employeeId) && Number(this.contactAnomaly?.employeeId) > 0;
  }

  get selectedFeatures(): Record<string, unknown> {
    return this.toFeatureRecord(this.detailsAnomaly);
  }

  get selectedFeatureEntries(): Array<{ key: string; value: string }> {
    return Object.entries(this.selectedFeatures)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key, value: this.formatFeatureValue(value) }));
  }

  get selectedSnapshot(): FeatureSnapshotItem[] {
    const attendance = this.detailsAnomaly?.attendanceSnapshot;
    if (attendance) {
      const entries = Object.entries(ATTENDANCE_SNAPSHOT_LABELS)
        .filter(([key]) => Object.prototype.hasOwnProperty.call(attendance, key))
        .map(([key, label]) => ({
          key,
          label,
          value: this.formatSnapshotValue(key, (attendance as Record<string, unknown>)[key]),
        }))
        .filter(item => item.value !== '—');
      if (entries.length > 0) {
        return entries;
      }
    }

    const features = this.selectedFeatures;
    return Object.entries(SNAPSHOT_LABELS)
      .filter(([key]) => Object.prototype.hasOwnProperty.call(features, key))
      .map(([key, label]) => ({ key, label, value: this.formatFeatureValue(features[key]) }));
  }

  get selectedReasonEntries(): DetailReasonItem[] {
    const anomaly = this.detailsAnomaly;
    if (!anomaly) return [];
    const detected = anomaly.detectedReasons ?? [];
    if (detected.length > 0) {
      return detected
        .map(reason => ({
          label: reason.label || reason.code || 'Raison détectée',
          description: reason.description || '',
          value: reason.value ?? null,
          expected: reason.expected ?? null,
        }))
        .filter(reason => Boolean(reason.label || reason.description));
    }
    return (anomaly.reasons ?? []).map(reason => ({
      label: reason,
      description: '',
      value: null,
      expected: null,
    }));
  }

  get selectedRecommendation(): string {
    return this.detailsAnomaly?.recommendation?.trim()
      || 'Vérifier le pointage, confirmer le contexte avec le collaborateur et mettre à jour le suivi RH si nécessaire.';
  }

  get selectedWarnings(): string[] {
    return (this.detailsAnomaly?.missingDataWarnings ?? [])
      .map(warning => String(warning).trim())
      .filter(Boolean);
  }

  get selectedEnterpriseLabel(): string | null {
    return this.enterpriseLabel(this.detailsAnomaly ?? this.contactAnomaly);
  }

  toggle(id: string): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  toggleCollapsed(): void {
    this.collapsed.update(value => !value);
  }

  toggleShowAll(): void {
    this.showAll.update(val => !val);
  }

  setRiskFilter(value: string): void {
    const normalized = value.toUpperCase();
    this.riskFilter = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].includes(normalized)
      ? normalized as AnomalyRisk
      : 'ALL';
    this.showAll.set(false);
    setTimeout(() => this.updateScrollButtons(), 200);
  }

  setSortMode(value: string): void {
    this.sortMode = ['DATE_DESC', 'EMPLOYEE_ASC'].includes(value)
      ? value as AnomalySort
      : 'SCORE_DESC';
  }

  isExpanded(id: string): boolean {
    return this.expanded() === id;
  }

  riskTone(risk: AnomalyRisk | string | undefined): 'critical' | 'high' | 'medium' | 'low' {
    const value = (risk || '').toString().toUpperCase();
    if (value === 'CRITICAL') return 'critical';
    if (value === 'HIGH') return 'high';
    if (value === 'MEDIUM') return 'medium';
    return 'low';
  }

  initials(name: string | undefined): string {
    if (!name) return '?';
    return name.trim().split(/\s+/).slice(0, 2)
      .map(p => p.charAt(0).toUpperCase()).join('') || '?';
  }

  scorePct(score: number | undefined): number {
    if (typeof score !== 'number' || !Number.isFinite(score)) return 0;
    return Math.round(Math.max(0, Math.min(1, score)) * 100);
  }

  trackByAnomaly = (_i: number, a: AnomalyRecord): string => this.anomalyKey(a);

  handleAction(event: { kind: AnomalyAction; anomaly: AnomalyRecord }): void {
    if (this.pendingAction) return;
    if (event.kind === 'open') {
      this.openDetails(event.anomaly);
    } else if (event.kind === 'contact') {
      this.openContact(event.anomaly);
    } else {
      this.openIgnoreConfirm(event.anomaly);
    }
  }

  openDetails(anomaly: AnomalyRecord): void {
    this.detailsAnomaly = anomaly;
  }

  openContact(anomaly: AnomalyRecord): void {
    this.contactAnomaly = anomaly;
    this.contactMessage = this.defaultContactMessage(anomaly);
  }

  openIgnoreConfirm(anomaly: AnomalyRecord): void {
    this.ignoreCandidate = anomaly;
    this.ignoreReason = 'Faux positif';
    this.customIgnoreReason = '';
  }

  closePanels(): void {
    if (this.pendingAction) return;
    this.detailsAnomaly = null;
    this.contactAnomaly = null;
    this.ignoreCandidate = null;
  }

  async prepareMessage(): Promise<void> {
    if (!this.contactMessage.trim()) return;
    this.pendingAction = 'prepare';
    try {
      await navigator.clipboard?.writeText(this.contactMessage.trim());
    } catch {
      // The message is still prepared in the textarea when clipboard access is denied.
    } finally {
      this.toast.info('Message préparé. L’intégration messagerie sera connectée au module Messages.');
      this.pendingAction = null;
    }
  }

  async sendContactMessage(): Promise<void> {
    const anomaly = this.contactAnomaly;
    const body = this.contactMessage.trim();
    if (!anomaly || !body || !this.canSendContact) return;
    this.pendingAction = 'contact';
    try {
      const channel = await firstValueFrom(this.communicationApi.openDirectMessage(anomaly.employeeId));
      await firstValueFrom(this.communicationApi.sendMessage(channel.id, {
        clientMessageId: this.createClientMessageId(),
        type: 'TEXT',
        body,
        metadata: {
          source: 'AI_ATTENDANCE_ANOMALY',
          employeeId: anomaly.employeeId,
          date: anomaly.date,
          risk: anomaly.risk,
          score: anomaly.score,
          scope: this.scope,
        },
      }));
      this.toast.success('Message envoyé dans le module Messages.');
      this.contactAnomaly = null;
    } catch {
      this.toast.error('Impossible d’envoyer le message pour le moment.');
    } finally {
      this.pendingAction = null;
    }
  }

  confirmIgnore(): void {
    const anomaly = this.ignoreCandidate;
    if (!anomaly) return;
    this.pendingAction = 'ignore';
    const key = this.anomalyKey(anomaly);
    this.ignoredKeys = new Set([...this.ignoredKeys, key]);
    this.persistIgnoredKeys();
    this.ignoreCandidate = null;
    this.pendingAction = null;
    const reason = this.ignoreReason === 'Autre' && this.customIgnoreReason.trim()
      ? this.customIgnoreReason.trim()
      : this.ignoreReason;
    this.toast.success(`Anomalie ignorée (${reason}).`);
  }

  featureValue(anomaly: AnomalyRecord | null, key: string): string | null {
    const features = this.toFeatureRecord(anomaly);
    if (!Object.prototype.hasOwnProperty.call(features, key)) return null;
    return this.formatFeatureValue(features[key]);
  }

  enterpriseLabel(anomaly: AnomalyRecord | null): string | null {
    const features = this.toFeatureRecord(anomaly);
    const name = features['entreprise'] ?? features['enterprise'] ?? features['company'] ?? features['companyName'];
    const id = features['entrepriseId'] ?? features['enterpriseId'] ?? features['company_id'];
    if (name !== undefined && name !== null && String(name).trim()) {
      return id !== undefined && id !== null && String(id).trim()
        ? `${String(name).trim()} · #${String(id).trim()}`
        : String(name).trim();
    }
    if (id !== undefined && id !== null && String(id).trim()) {
      return `Entreprise #${String(id).trim()}`;
    }
    return null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closePanels();
  }

  private defaultContactMessage(anomaly: AnomalyRecord): string {
    return `Bonjour ${anomaly.employeeName}, nous avons détecté une anomalie de présence aujourd’hui. Pouvez-vous confirmer votre situation ?`;
  }

  private anomalyKey(anomaly: AnomalyRecord): string {
    return `${anomaly.employeeId}|${anomaly.date}|${String(anomaly.category || '').toUpperCase()}`;
  }

  private storageKey(): string {
    return `weentime_ignored_anomalies_${this.localDateKey()}_${this.scope}`;
  }

  private localDateKey(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private loadIgnoredKeys(): void {
    try {
      const raw = localStorage.getItem(this.storageKey());
      const values = raw ? JSON.parse(raw) : [];
      this.ignoredKeys = new Set(Array.isArray(values) ? values.map(String) : []);
    } catch {
      this.ignoredKeys = new Set();
    }
  }

  private persistIgnoredKeys(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify([...this.ignoredKeys]));
    } catch {
      this.toast.warning('L’anomalie a été masquée pour cette vue, mais le stockage local est indisponible.');
    }
  }

  private toFeatureRecord(anomaly: AnomalyRecord | null): Record<string, unknown> {
    return (anomaly?.features ?? {}) as Record<string, unknown>;
  }

  private formatFeatureValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    return String(value);
  }

  private formatSnapshotValue(key: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
    if (typeof value === 'number' && key.toLowerCase().includes('minutes')) {
      return this.formatMinutes(value);
    }
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
    return String(value);
  }

  private formatMinutes(minutes: number): string {
    const rounded = Math.max(0, Math.round(minutes));
    if (rounded < 60) return `${rounded} min`;
    const hours = Math.floor(rounded / 60);
    const rest = rounded % 60;
    return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`;
  }

  private createClientMessageId(): string {
    return `anomaly-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.updateScrollButtons(), 200);
  }

  @HostListener('window:resize')
  onResize(): void {
    this.updateScrollButtons();
  }

  updateScrollButtons(): void {
    const grid = this.cardGrid?.nativeElement;
    if (!grid) {
      this.showLeftBtn.set(false);
      this.showRightBtn.set(false);
      return;
    }
    this.showLeftBtn.set(grid.scrollLeft > 5);
    this.showRightBtn.set(grid.scrollWidth > grid.clientWidth + grid.scrollLeft + 5);
  }

  onGridScroll(): void {
    this.updateScrollButtons();
  }

  scrollCards(direction: number): void {
    const grid = this.cardGrid?.nativeElement;
    if (!grid) return;
    const scrollAmount = grid.clientWidth * 0.75;
    grid.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
  }
}
