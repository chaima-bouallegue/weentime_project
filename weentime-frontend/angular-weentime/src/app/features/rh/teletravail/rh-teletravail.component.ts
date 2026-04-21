import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TeletravailService } from '../../employee/teletravail/teletravail.service';
import { DemandeTeletravailWorkflow, StatsRH } from '../../shared/models/workflow-teletravail.model';
import { StatsRhCardsComponent } from './components/stats-rh-cards/stats-rh-cards.component';
import { DemandesRhListComponent } from './components/demandes-rh-list/demandes-rh-list.component';
import { DecisionRhModalComponent } from './components/decision-rh-modal/decision-rh-modal.component';
import { HistoriqueGlobalComponent } from './components/historique-global/historique-global.component';

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
  private readonly service = inject(TeletravailService);
  private readonly destroyRef = inject(DestroyRef);

  readonly demandesEnAttente = signal<DemandeTeletravailWorkflow[]>([]);
  readonly historiqueGlobal = signal<DemandeTeletravailWorkflow[]>([]);
  readonly stats = signal<StatsRH | null>(null);
  readonly isLoading = signal(true);
  readonly loadWarning = signal<string | null>(null);
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
    if (!mode) {
      return;
    }

    this.isSubmitting.set(true);
    const backup = this.demandesEnAttente();
    this.demandesEnAttente.update(list => list.filter(d => d.id !== event.id));

    const request$ = mode === 'VALIDER'
      ? this.service.validerRH(event.id, event.commentaire)
      : this.service.rejeterRH(event.id, event.commentaire);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: result => {
          this.isSubmitting.set(false);
          this.closeModal();
          this.historiqueGlobal.update(list => result ? [result, ...list] : list);
          this.stats.update(current => current ? {
            ...current,
            enAttente: Math.max(current.enAttente - 1, 0),
            ...(mode === 'VALIDER'
              ? { approuveCeMois: current.approuveCeMois + 1 }
              : { refuseCeMois: current.refuseCeMois + 1 })
          } : current);
        },
        error: () => {
          this.demandesEnAttente.set(backup);
          this.isSubmitting.set(false);
        }
      });
  }

  private startPolling(): void {
    timer(0, 10000)
      .pipe(
        switchMap(() => {
          this.isLoading.set(true);
          return forkJoin({
            stats: this.service.getStatsRH(),
            pending: this.service.getDemandesEnAttenteRH(),
            history: this.service.getHistoriqueGlobal()
          }).pipe(
            catchError(() => {
              this.loadWarning.set('Certaines donnees RH sont indisponibles pour le moment.');
              return of({
                stats: null,
                pending: [] as DemandeTeletravailWorkflow[],
                history: [] as DemandeTeletravailWorkflow[]
              });
            })
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ stats, pending, history }) => {
        this.stats.set(stats);
        this.demandesEnAttente.set(pending);
        this.historiqueGlobal.set(history);
        this.loadWarning.set(stats === null ? 'Certaines donnees RH sont indisponibles pour le moment.' : null);
        this.isLoading.set(false);
      });
  }
}
