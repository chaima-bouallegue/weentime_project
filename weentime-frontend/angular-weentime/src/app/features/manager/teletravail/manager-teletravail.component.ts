import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { forkJoin, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TeletravailService } from '../../employee/teletravail/teletravail.service';
import {
  DemandeTeletravailWorkflow,
  StatsWorkflow,
  StatutTeletravail
} from '../../shared/models/workflow-teletravail.model';
import { DecisionModalComponent } from './components/decision-modal/decision-modal.component';
import { DemandesListComponent } from './components/demandes-list/demandes-list.component';
import { StatsCardsComponent } from './components/stats-cards/stats-cards.component';

@Component({
  selector: 'app-manager-teletravail',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, StatsCardsComponent, DemandesListComponent, DecisionModalComponent],
  templateUrl: './manager-teletravail.component.html',
  styleUrl: './manager-teletravail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerTeletravailComponent implements OnInit {
  private readonly service = inject(TeletravailService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly defaultStatusConfig = { label: 'Statut inconnu', color: 'badge-gray', icon: 'help-circle' } as const;

  readonly demandesEnAttente = signal<DemandeTeletravailWorkflow[]>([]);
  readonly historique = signal<DemandeTeletravailWorkflow[]>([]);
  readonly stats = signal<StatsWorkflow | null>(null);
  readonly isLoading = signal(true);
  readonly loadWarning = signal<string | null>(null);
  readonly demandeSelectionnee = signal<DemandeTeletravailWorkflow | null>(null);
  readonly modeDecision = signal<'VALIDER' | 'REFUSER' | null>(null);
  readonly isSubmitting = signal(false);
  readonly filtreHistorique = signal<'TOUS' | 'APPROUVE' | 'REFUSE'>('TOUS');
  readonly showHistorique = signal(false);

  readonly historiqueFiltre = computed(() => {
    const filtre = this.filtreHistorique();
    if (filtre === 'TOUS') {
      return this.historique();
    }

    const statutMap: Record<'APPROUVE' | 'REFUSE', StatutTeletravail> = {
      APPROUVE: 'APPROUVE',
      REFUSE: 'REFUSE'
    };

    return this.historique().filter(demande => demande.statut === statutMap[filtre]);
  });

  ngOnInit(): void {
    this.startPolling();
  }

  onValider(demande: DemandeTeletravailWorkflow): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('VALIDER');
  }

  onRefuser(demande: DemandeTeletravailWorkflow): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('REFUSER');
  }

  closeModal(): void {
    this.demandeSelectionnee.set(null);
    this.modeDecision.set(null);
  }

  onConfirmDecision(event: { id: number; commentaire: string }): void {
    const mode = this.modeDecision();
    if (!mode) {
      return;
    }

    this.isSubmitting.set(true);
    const backup = this.demandesEnAttente();
    this.demandesEnAttente.update(list => list.filter(demande => demande.id !== event.id));

    const request$ = mode === 'VALIDER'
      ? this.service.validerManager(event.id, event.commentaire)
      : this.service.rejeterManager(event.id, event.commentaire);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.isSubmitting.set(false);
          this.closeModal();
          this.historique.update(list => (result ? [result, ...list] : list));
          this.stats.update(current => {
            if (!current) {
              return current;
            }

            return {
              ...current,
              enAttente: Math.max(current.enAttente - 1, 0),
              ...(mode === 'VALIDER'
                ? { valideesAujourdhui: current.valideesAujourdhui + 1 }
                : { refuseesAujourdhui: current.refuseesAujourdhui + 1 })
            };
          });
        },
        error: () => {
          this.demandesEnAttente.set(backup);
          this.isSubmitting.set(false);
        }
      });
  }

  getStatusConfig(statut: StatutTeletravail): { label: string; color: string; icon: string } {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER':
        return { label: 'En attente', color: 'badge-warning', icon: 'clock' };
      case 'EN_ATTENTE_RH':
        return { label: 'Transferee RH', color: 'badge-info', icon: 'clock' };
      case 'APPROUVE':
        return { label: 'Approuve', color: 'badge-success', icon: 'check-circle' };
      case 'REFUSE':
        return { label: 'Refuse', color: 'badge-danger', icon: 'x-circle' };
      case 'ANNULE':
        return { label: 'Annule', color: 'badge-gray', icon: 'minus-circle' };
      default:
        return this.defaultStatusConfig;
    }
  }

  private startPolling(): void {
    timer(0, 10000)
      .pipe(
        switchMap(() => {
          this.isLoading.set(true);
          return forkJoin({
            stats: this.service.getStatsManager(),
            pending: this.service.getDemandesEquipe(),
            history: this.service.getMesDecisions()
          });
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ stats, pending, history }) => {
          this.stats.set(stats);
          this.demandesEnAttente.set(pending ?? []);
          this.historique.set(history ?? []);
          this.loadWarning.set(stats === null ? 'Certaines donnees manager sont indisponibles pour le moment.' : null);
          this.isLoading.set(false);
        },
        error: () => {
          this.stats.set(null);
          this.demandesEnAttente.set([]);
          this.historique.set([]);
          this.loadWarning.set('Le workflow teletravail manager est temporairement indisponible.');
          this.isLoading.set(false);
        }
      });
  }
}
