import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  Clock,
  CircleCheck,
  CircleX,
  Eye,
  Download,
  RefreshCw,
  Calendar,
  Laptop,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, timer } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { TeletravailService } from '../../employee/teletravail/teletravail.service';
import { DemandeTeletravailWorkflow } from '../../shared/models/workflow-teletravail.model';
import { DecisionRhModalComponent } from './components/decision-rh-modal/decision-rh-modal.component';
import { RhTeletravailStore } from '../../../core/services/rh-teletravail.store';
import { EmployeeTeletravailComponent } from '../../employee/teletravail/employee-teletravail.component';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { DateFrPipe } from '../../../shared/pipes/date-fr.pipe';

@Component({
  selector: 'app-rh-teletravail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    LucideAngularModule,
    DecisionRhModalComponent,
    EmployeeTeletravailComponent
  ],
  templateUrl: './rh-teletravail.component.html',
  styleUrl: './rh-teletravail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhTeletravailComponent implements OnInit {
  readonly ClockIcon = Clock;
  readonly CheckIcon = CircleCheck;
  readonly XIcon = CircleX;
  readonly EyeIcon = Eye;
  readonly DownloadIcon = Download;
  readonly RefreshCwIcon = RefreshCw;
  readonly CalendarIcon = Calendar;
  readonly LaptopIcon = Laptop;
  readonly SearchIcon = Search;
  readonly ChevronLeftIcon = ChevronLeft;
  readonly ChevronRightIcon = ChevronRight;
  protected readonly Math = Math;

  private readonly store = inject(RhTeletravailStore);
  private readonly service = inject(TeletravailService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly toastService = inject(ToastService);

  readonly isRh = computed(() => this.authService.hasRole('RH'));
  readonly activeTab = signal<'mes-demandes' | 'gestion'>('gestion');

  readonly demandesEnAttente = this.store.demandesEnAttente;
  readonly historiqueGlobal = this.store.historiqueGlobal;
  readonly stats = this.store.stats;
  readonly isLoading = this.store.isLoading;
  readonly loadWarning = this.store.error;

  // ── Unified requests collection ──
  readonly allDemandes = computed(() => {
    const history = this.historiqueGlobal();
    const pending = this.demandesEnAttente();
    const map = new Map<number, DemandeTeletravailWorkflow>();

    for (const d of history) {
      map.set(d.id, d);
    }
    for (const p of pending) {
      map.set(p.id, p);
    }

    return Array.from(map.values()).sort((a, b) =>
      new Date(b.dateCreation || b.dateDebut).getTime() - new Date(a.dateCreation || a.dateDebut).getTime()
    );
  });

  readonly allDemandesCount = computed(() => this.allDemandes().length);

  // ── Real Statistics Computations ──
  readonly approuveCeMoisCount = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const fromDemandes = this.allDemandes().filter(d => {
      if (d.statut !== 'APPROUVE') return false;
      const date = d.dateCreation ? new Date(d.dateCreation) : (d.dateDebut ? new Date(d.dateDebut) : null);
      return date && date.getFullYear() === currentYear && date.getMonth() === currentMonth;
    }).length;

    return fromDemandes > 0 ? fromDemandes : (this.stats()?.approuveCeMois ?? 0);
  });

  readonly refuseCeMoisCount = computed(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const fromDemandes = this.allDemandes().filter(d => {
      if (d.statut !== 'REFUSE') return false;
      const date = d.dateCreation ? new Date(d.dateCreation) : (d.dateDebut ? new Date(d.dateDebut) : null);
      return date && date.getFullYear() === currentYear && date.getMonth() === currentMonth;
    }).length;

    return fromDemandes > 0 ? fromDemandes : (this.stats()?.refuseCeMois ?? 0);
  });

  readonly approvalRate = computed(() => {
    const demandes = this.allDemandes();
    const approuvees = demandes.filter(d => d.statut === 'APPROUVE').length;
    const refusees = demandes.filter(d => d.statut === 'REFUSE').length;
    const decidees = approuvees + refusees;

    if (decidees > 0) {
      return Math.round((approuvees / decidees) * 100);
    }

    const backendTaux = this.stats()?.tauxApprobation;
    if (backendTaux !== undefined && backendTaux !== null && !isNaN(backendTaux)) {
      return Math.round(backendTaux);
    }

    return null;
  });

  // ── Status Tab Counts ──
  readonly enAttenteRhCount = computed(() => this.allDemandes().filter(d => d.statut === 'EN_ATTENTE_RH').length);
  readonly enAttenteManagerCount = computed(() => this.allDemandes().filter(d => d.statut === 'EN_ATTENTE_MANAGER').length);
  readonly approuveCount = computed(() => this.allDemandes().filter(d => d.statut === 'APPROUVE').length);
  readonly refuseCount = computed(() => this.allDemandes().filter(d => d.statut === 'REFUSE').length);
  readonly annuleCount = computed(() => this.allDemandes().filter(d => d.statut === 'ANNULE').length);

  // ── Filters & Search ──
  readonly searchQuery = signal('');
  readonly statusFilter = signal<string>('ALL');
  readonly typeFilter = signal<string>('ALL');
  readonly departmentFilter = signal<string>('ALL');
  readonly currentPage = signal(1);
  readonly pageSize = 10;

  // Real types derived from real requests & standard catalog
  readonly availableTypes = computed(() => {
    const map = new Map<string, string>();
    map.set('JOURNEE_COMPLETE', 'Journée complète');
    map.set('DEMI_JOURNEE_MATIN', 'Matinée');
    map.set('DEMI_JOURNEE_APRES_MIDI', 'Après-midi');
    map.set('SEMAINE_COMPLETE', 'Semaine complète');

    for (const d of this.allDemandes()) {
      if (d.type && !map.has(d.type)) {
        map.set(d.type, d.label || d.type);
      }
    }

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  });

  // Real departments derived from actual employees in requests
  readonly availableDepartments = computed(() => {
    const set = new Set<string>();
    for (const d of this.allDemandes()) {
      const dept = d.employe?.departement?.trim();
      if (dept) set.add(dept);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'fr'));
  });

  private readonly searchSubject = new Subject<string>();

  readonly filteredDemandes = computed(() => {
    let list = this.allDemandes();
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();
    const type = this.typeFilter();
    const dept = this.departmentFilter();

    if (query) {
      list = list.filter(d =>
        (d.employe?.prenom || '').toLowerCase().includes(query) ||
        (d.employe?.nom || '').toLowerCase().includes(query) ||
        (d.employe?.departement || '').toLowerCase().includes(query) ||
        (d.employe?.poste || '').toLowerCase().includes(query) ||
        (d.employe?.email || '').toLowerCase().includes(query) ||
        (d.label || '').toLowerCase().includes(query) ||
        (d.motif || '').toLowerCase().includes(query)
      );
    }

    if (status !== 'ALL') {
      list = list.filter(d => d.statut === status);
    }

    if (type !== 'ALL') {
      list = list.filter(d => d.type === type);
    }

    if (dept !== 'ALL') {
      list = list.filter(d => (d.employe?.departement || '').trim() === dept);
    }

    return list;
  });

  readonly hasActiveFilters = computed(() =>
    this.searchQuery() !== '' ||
    this.statusFilter() !== 'ALL' ||
    this.typeFilter() !== 'ALL' ||
    this.departmentFilter() !== 'ALL'
  );

  readonly paginatedDemandes = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredDemandes().slice(start, start + this.pageSize);
  });

  readonly totalPages = computed(() => Math.ceil(this.filteredDemandes().length / this.pageSize) || 1);

  // ── Decision & Consultation Modal State ──
  readonly demandeSelectionnee = signal<DemandeTeletravailWorkflow | null>(null);
  readonly modeDecision = signal<'VALIDER' | 'REFUSER' | 'CONSULTER' | null>(null);
  readonly isSubmitting = signal(false);

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(q => {
      this.searchQuery.set(q);
      this.currentPage.set(1);
    });
  }

  ngOnInit(): void {
    this.refresh();
    this.startPolling();
  }

  onSearchInput(value: string): void {
    this.searchSubject.next(value);
  }

  setStatusFilter(status: string): void {
    this.statusFilter.set(status);
    this.currentPage.set(1);
  }

  setTypeFilter(type: string): void {
    this.typeFilter.set(type);
    this.currentPage.set(1);
  }

  setDepartmentFilter(dept: string): void {
    this.departmentFilter.set(dept);
    this.currentPage.set(1);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('ALL');
    this.typeFilter.set('ALL');
    this.departmentFilter.set('ALL');
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: number[] = [1];
    if (current > 3) pages.push(-1);
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push(-1);
    pages.push(total);
    return pages;
  }

  refresh(): void {
    this.store.loadAll(true).subscribe();
  }

  onApprouver(demande: DemandeTeletravailWorkflow): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('VALIDER');
  }

  onRefuser(demande: DemandeTeletravailWorkflow): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('REFUSER');
  }

  onConsulter(demande: DemandeTeletravailWorkflow): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('CONSULTER');
  }

  onSwitchMode(mode: 'VALIDER' | 'REFUSER'): void {
    this.modeDecision.set(mode);
  }

  closeModal(): void {
    this.demandeSelectionnee.set(null);
    this.modeDecision.set(null);
  }

  onConfirmDecision(event: { id: number; commentaire: string }): void {
    const mode = this.modeDecision();
    if (!mode || mode === 'CONSULTER') return;

    this.isSubmitting.set(true);
    const request$ = mode === 'VALIDER'
      ? this.service.validerRH(event.id, event.commentaire)
      : this.service.rejeterRH(event.id, event.commentaire);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.isSubmitting.set(false);
          this.closeModal();
          this.store.updateAfterDecision(event.id, result, mode);
          this.toastService.success(mode === 'VALIDER' ? 'Demande approuvée avec succès.' : 'Demande refusée.');
          this.refresh();
        },
        error: () => {
          this.isSubmitting.set(false);
          this.toastService.error('Une erreur est survenue lors du traitement.');
        }
      });
  }

  exportCSV(): void {
    const list = this.filteredDemandes();
    if (list.length === 0) {
      this.toastService.error('Aucune demande de télétravail à exporter.');
      return;
    }

    const headers = [
      'ID',
      'Collaborateur',
      'Département',
      'Poste',
      'Type',
      'Date début',
      'Date fin',
      'Nombre de jours',
      'Statut',
      'Avis Manager',
      'Commentaire RH',
      'Date création'
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = list.map(d => [
      escapeCsv(d.id),
      escapeCsv(`${d.employe.prenom} ${d.employe.nom}`.trim()),
      escapeCsv(d.employe.departement || '—'),
      escapeCsv(d.employe.poste || '—'),
      escapeCsv(d.label || d.type),
      escapeCsv(d.dateDebut),
      escapeCsv(d.dateFin),
      escapeCsv(d.nombreJours),
      escapeCsv(this.getStatusLabel(d.statut)),
      escapeCsv(d.commentaireManager || '—'),
      escapeCsv(d.commentaireRH || '—'),
      escapeCsv(d.dateCreation ? new Date(d.dateCreation).toLocaleDateString('fr-FR') : '—')
    ].join(';'));

    const csvContent = '\ufeff' + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `teletravail-rh-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.toastService.success(`${list.length} demande(s) exportée(s) en CSV avec succès.`);
  }

  getAvatarColor(initials: string): string {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < (initials || '').length; i++) hash = initials.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  formatDateRange(d: DemandeTeletravailWorkflow): string {
    if (!d.dateDebut) return '—';
    const pipe = new DateFrPipe();
    if (d.dateDebut === d.dateFin || !d.dateFin) {
      return pipe.transform(d.dateDebut);
    }
    return `${pipe.transform(d.dateDebut)} → ${pipe.transform(d.dateFin)}`;
  }

  getStatusLabel(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE_RH': return 'À valider RH';
      case 'EN_ATTENTE_MANAGER': return 'Attente manager';
      case 'APPROUVE': return 'Approuvé';
      case 'REFUSE': return 'Refusé';
      case 'ANNULE': return 'Annulé';
      default: return statut || 'Inconnu';
    }
  }

  getStatusBadgeClass(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE_RH': return 'badge--warn';
      case 'EN_ATTENTE_MANAGER': return 'badge--info';
      case 'APPROUVE': return 'badge--active';
      case 'REFUSE': return 'badge--danger';
      case 'ANNULE': return 'badge--inactive';
      default: return 'badge--inactive';
    }
  }

  getTypeLabel(d: DemandeTeletravailWorkflow): string {
    if (d.label && d.label !== d.type) return d.label;
    switch (d.type) {
      case 'JOURNEE_COMPLETE': return 'Journée complète';
      case 'DEMI_JOURNEE_MATIN': return 'Matinée';
      case 'DEMI_JOURNEE_APRES_MIDI': return 'Après-midi';
      case 'SEMAINE_COMPLETE': return 'Semaine complète';
      default: return d.label || d.type || 'Télétravail';
    }
  }

  getTypeBadgeClass(type: string): string {
    switch (type) {
      case 'JOURNEE_COMPLETE': return 'type-badge--indigo';
      case 'SEMAINE_COMPLETE': return 'type-badge--violet';
      case 'DEMI_JOURNEE_MATIN': return 'type-badge--amber';
      case 'DEMI_JOURNEE_APRES_MIDI': return 'type-badge--blue';
      default: return 'type-badge--slate';
    }
  }

  private startPolling(): void {
    timer(30000, 30000)
      .pipe(
        switchMap(() => this.store.loadAll(true)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
}
