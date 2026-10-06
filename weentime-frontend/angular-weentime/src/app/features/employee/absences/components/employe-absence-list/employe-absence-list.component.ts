import {
  Component, inject, signal, computed,
  output, ChangeDetectionStrategy, OnInit, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AbsenceService } from '../../../../rh/absences/absence.service';
import { ToastService } from '../../../../../core/services/toast.service';
import {
  AbsenceResponse, AbsencePage, AbsenceStatut,
  STATUT_CONFIG, ABSENCE_TYPES
} from '../../../../rh/absences/absence.models';
import { ConfirmCancellationModalComponent, CancellationPreviewItem } from '../../../../../shared/components/confirm-cancellation-modal';
import { DemandeActionsMenuComponent } from '../../../../../shared/components/demande-actions-menu';

@Component({
  selector: 'app-employe-absence-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ConfirmCancellationModalComponent, DemandeActionsMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employe-absence-list.component.html',
  styleUrls: ['./employe-absence-list.component.scss']
})
export class EmployeAbsenceListComponent implements OnInit {
  private absenceService = inject(AbsenceService);
  private toast = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  addNew = output<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  loading = signal(true);
  absences = signal<AbsenceResponse[]>([]);
  totalPages = signal(0);
  totalItems = signal(0);
  page = signal(0);
  pageSize = 10;

  filterStatut = signal<string>('');
  filterType = signal<string>('');
  cancelingId = signal<number | null>(null);
  demandeAnnuler = signal<AbsenceResponse | null>(null);

  absenceCancellationPreviewItems = computed<CancellationPreviewItem[]>(() => {
    const d = this.demandeAnnuler();
    if (!d) return [];
    return [
      { label: 'Type', value: `${this.getTypeEmoji(d.typeAbsenceCode)} ${d.typeAbsenceLibelle}`, highlight: true },
      { label: 'Période', value: `Du ${this.formatDate(d.dateDebut)} au ${this.formatDate(d.dateFin)}` },
      { label: 'Durée', value: `${d.dureeJours} jour${d.dureeJours > 1 ? 's' : ''}` }
    ];
  });

  // ── Config ────────────────────────────────────────────────────────────────
  readonly statutOptions = [
    { value: '', label: 'Tous les statuts' },
    { value: 'EN_ATTENTE', label: 'En attente' },
    { value: 'APPROUVE', label: 'Approuvé' },
    { value: 'REFUSE', label: 'Refusé' },
    { value: 'ANNULE', label: 'Annulé' }
  ];

  readonly typeOptions = [
    { value: '', label: 'Tous les types' },
    ...ABSENCE_TYPES.map(t => ({ value: t.code, label: t.libelle }))
  ];

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadAbsences();
  }

  loadAbsences(): void {
    this.loading.set(true);
    this.absenceService.mesAbsences({
      page: this.page(),
      size: this.pageSize,
      statut: this.filterStatut() || undefined,
      type: this.filterType() || undefined
    }).subscribe({
      next: (data: AbsencePage) => {
        this.absences.set(data.content);
        this.totalPages.set(data.totalPages);
        this.totalItems.set(data.totalElements);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.toast.error('Erreur lors du chargement des absences.');
        this.loading.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  onFilterChange(): void {
    this.page.set(0);
    this.loadAbsences();
  }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages()) return;
    this.page.set(p);
    this.loadAbsences();
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  onCancelRequest(absence: AbsenceResponse): void {
    if (this.cancelingId()) return;
    this.demandeAnnuler.set(absence);
  }

  confirmAnnulation(): void {
    const absence = this.demandeAnnuler();
    if (!absence) return;
    this.cancelingId.set(absence.id);
    this.absenceService.annuler(absence.id).subscribe({
      next: () => {
        this.toast.success('Absence annulée avec succès.');
        this.cancelingId.set(null);
        this.demandeAnnuler.set(null);
        this.loadAbsences();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Impossible d\'annuler cette absence.');
        this.cancelingId.set(null);
        this.demandeAnnuler.set(null);
        this.cdr.markForCheck();
      }
    });
  }

  // ── Computed helpers ─────────────────────────────────────────────────────
  pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i));

  getStatutConfig(statut: AbsenceStatut) {
    return STATUT_CONFIG[statut] ?? { label: statut, cssClass: 'badge-gray' };
  }

  formatDate(d: string): string {
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(d));
  }

  getTypeEmoji(code: string): string {
    return ABSENCE_TYPES.find(t => t.code === code)?.emoji ?? '❓';
  }

  trackById(_: number, item: AbsenceResponse): number {
    return item.id;
  }
}
