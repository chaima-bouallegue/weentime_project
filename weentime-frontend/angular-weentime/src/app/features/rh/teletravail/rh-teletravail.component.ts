import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TeletravailService } from '../../employee/teletravail/teletravail.service';
import { DemandeTeletravailWorkflow } from '../../shared/models/workflow-teletravail.model';
import { StatsRhCardsComponent } from './components/stats-rh-cards/stats-rh-cards.component';
import { DemandesRhListComponent } from './components/demandes-rh-list/demandes-rh-list.component';
import { DecisionRhModalComponent } from './components/decision-rh-modal/decision-rh-modal.component';
import { HistoriqueGlobalComponent } from './components/historique-global/historique-global.component';
import { RhTeletravailStore } from '../../../core/services/rh-teletravail.store';

@Component({
  selector: 'app-rh-teletravail',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    StatsRhCardsComponent,
    DemandesRhListComponent,
    DecisionRhModalComponent,
    HistoriqueGlobalComponent
  ],
  templateUrl: './rh-teletravail.component.html',
  styleUrl: './rh-teletravail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhTeletravailComponent implements OnInit {
  private readonly store = inject(RhTeletravailStore);
  private readonly service = inject(TeletravailService);
  private readonly destroyRef = inject(DestroyRef);

  readonly demandesEnAttente = this.store.demandesEnAttente;
  readonly historiqueGlobal = this.store.historiqueGlobal;
  readonly stats = this.store.stats;
  readonly isLoading = this.store.isLoading;
  readonly loadWarning = this.store.error;

  readonly demandeSelectionnee = signal<DemandeTeletravailWorkflow | null>(null);
  readonly modeDecision = signal<'VALIDER' | 'REFUSER' | null>(null);
  readonly isSubmitting = signal(false);

  ngOnInit(): void {
    this.startPolling();
  }

  onApprouver(demande: DemandeTeletravailWorkflow): void {
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
    if (!mode) return;

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
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
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
