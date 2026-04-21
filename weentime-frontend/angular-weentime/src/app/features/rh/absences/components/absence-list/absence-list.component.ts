import {
  Component, inject, signal, computed,
  output, ChangeDetectionStrategy, OnInit, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AbsenceService } from '../../absence.service';
import { ToastService } from '../../../../../core/services/toast.service';
import {
  AbsenceResponse, AbsencePage, AbsenceStatut,
  STATUT_CONFIG, ABSENCE_TYPES
} from '../../absence.models';

@Component({
  selector: 'app-rh-absence-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './absence-list.component.html',
  styleUrls: ['./absence-list.component.scss']
})
export class RhAbsenceListComponent implements OnInit {
  private absenceService = inject(AbsenceService);
  private toast          = inject(ToastService);
  private cdr            = inject(ChangeDetectorRef);

  addNew = output<void>();

  // ── State ─────────────────────────────────────────────────────────────────
  loading      = signal(true);
  absences     = signal<AbsenceResponse[]>([]);
  totalPages   = signal(0);
  totalItems   = signal(0);
  page         = signal(0);
  pageSize     = 20;

  filterStatut   = signal<string>('');
  processingId   = signal<number | null>(null);

  // Modal rejet
  showRejetModal   = signal(false);
  rejetTargetId    = signal<number | null>(null);
  motifRefus       = signal('');
  motifRefusError  = signal<string | null>(null);

  // ── Config ────────────────────────────────────────────────────────────────
  readonly statutOptions = [
    { value: '',           label: 'Tous les statuts' },
    { value: 'EN_ATTENTE', label: 'En attente'        },
    { value: 'APPROUVE',   label: 'Approuvé'          },
    { value: 'REFUSE',     label: 'Refusé'            },
    { value: 'ANNULE',     label: 'Annulé'            }
  ];

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadAbsences();
  }

  loadAbsences(): void {
    this.loading.set(true);
    this.absenceService.absencesEntreprise({
      page:   this.page(),
      size:   this.pageSize,
      statut: this.filterStatut() || undefined
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

  // ── Valider ───────────────────────────────────────────────────────────────
  valider(id: number): void {
    if (this.processingId()) return;
    this.processingId.set(id);
    this.absenceService.valider(id).subscribe({
      next: () => {
        this.toast.success('Absence approuvée avec succès.');
        this.processingId.set(null);
        this.loadAbsences();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Impossible d\'approuver cette absence.');
        this.processingId.set(null);
        this.cdr.markForCheck();
      }
    });
  }

  // ── Ouvrir modal rejet ────────────────────────────────────────────────────
  openRejetModal(id: number): void {
    this.rejetTargetId.set(id);
    this.motifRefus.set('');
    this.motifRefusError.set(null);
    this.showRejetModal.set(true);
  }

  closeRejetModal(): void {
    this.showRejetModal.set(false);
    this.rejetTargetId.set(null);
  }

  confirmerRejet(): void {
    const motif = this.motifRefus().trim();
    if (!motif || motif.length < 5) {
      this.motifRefusError.set('Le motif de refus est obligatoire (min. 5 caractères).');
      return;
    }
    const id = this.rejetTargetId();
    if (!id) return;

    this.processingId.set(id);
    this.closeRejetModal();
    this.absenceService.rejeter(id, motif).subscribe({
      next: () => {
        this.toast.success('Absence rejetée.');
        this.processingId.set(null);
        this.loadAbsences();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Impossible de rejeter cette absence.');
        this.processingId.set(null);
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
    return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' }).format(new Date(d));
  }

  getInitials(libelle: string): string {
    return libelle?.slice(0, 2).toUpperCase() ?? 'N/A';
  }

  trackById(_: number, item: AbsenceResponse): number {
    return item.id;
  }
}
