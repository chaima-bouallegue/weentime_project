import { Component, signal, computed, inject, OnInit, DestroyRef, effect, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Calendar, Info, LucideAngularModule, Plus } from 'lucide-angular';
import { CongeService } from './conge.service';
import { SoldeConge, DemandeConge, StatutDemande, NouvelleDemandeRequest, JourFerie } from './models/conge.model';
import { SoldeCardsComponent } from './components/solde-cards/solde-cards.component';
import { HistoriqueListComponent } from './components/historique-list/historique-list.component';
import { CongeCalendarComponent } from './components/conge-calendar/conge-calendar.component';
import { DemandeDrawerComponent } from './components/demande-drawer/demande-drawer.component';
import { ConfirmCancellationModalComponent, CancellationPreviewItem } from '../../../shared/components/confirm-cancellation-modal';
import { ConsultationModalComponent } from './components/consultation-modal/consultation-modal.component';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { AssistantWorkflowService } from '../../../core/services/assistant-workflow.service';
import { ToastService } from '../../../core/services/toast.service';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-employee-conges',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    SoldeCardsComponent,
    HistoriqueListComponent,
    CongeCalendarComponent,
    DemandeDrawerComponent,
    ConfirmCancellationModalComponent,
    ConsultationModalComponent
  ],
  templateUrl: './employee-conges.component.html',
  styleUrl: './employee-conges.component.scss'
})
export class EmployeeCongesComponent implements OnInit {
  private congeService = inject(CongeService);
  private toastService = inject(ToastService);
  private assistantWorkflow = inject(AssistantWorkflowService);
  private assistantSync = inject(AssistantSyncService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);

  readonly iconPlus = Plus;
  readonly iconCalendar = Calendar;
  readonly iconInfo = Info;

  // Global State
  soldes = signal<SoldeConge[]>([]);
  historique = signal<DemandeConge[]>([]);
  joursFeries = signal<JourFerie[]>([]);
  typesConge = signal<any[]>([]);

  isLoading = signal(true);
  showDrawer = signal(false);
  demandeModifier = signal<DemandeConge | null>(null);
  demandeAnnuler = signal<DemandeConge | null>(null);
  demandeConsulter = signal<DemandeConge | null>(null);
  isAnnulating = signal(false);
  isSubmittingRequest = signal(false);

  filtreStatut = signal<StatutDemande | 'TOUS'>('TOUS');
  afficherTout = signal(false);

  totalDisponible = computed(() =>
    this.soldes().reduce((sum, s) => sum + (s.disponible ?? 0), 0)
  );

  congeCancellationPreviewItems = computed<CancellationPreviewItem[]>(() => {
    const d = this.demandeAnnuler();
    if (!d) return [];
    return [
      { label: 'Type de congé', value: d.type, highlight: true },
      { label: 'Dates', value: `Du ${new Date(d.dateDebut).toLocaleDateString('fr-FR')} au ${new Date(d.dateFin).toLocaleDateString('fr-FR')}` },
      { label: 'Durée totale', value: `${d.nombreJours} ${d.nombreJours > 1 ? 'jours' : 'jour'}` }
    ];
  });

  historiqueFiltre = computed(() => {
    const list = this.historique();
    const filter = this.filtreStatut();
    const filtered = filter === 'TOUS' ? list : list.filter(d => d.statut === filter);
    if (this.afficherTout()) {
      return filtered;
    }
    return filtered.slice(0, 5);
  });

  today = new Date();

  constructor() {
    effect(() => {
      const draft = this.assistantWorkflow.leaveDraft();
      if (draft?.autoOpen) {
        this.showDrawer.set(true);
      }
    });
  }

  ngOnInit() {
    this.loadData();
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.actionResult?.executed && event.actionResult.tool === 'create_leave') {
          this.refreshState();
        }
      });
  }

  loadData() {
    this.isLoading.set(true);
    forkJoin({
      soldes: this.congeService.getSoldes(),
      historique: this.congeService.getHistorique(),
      types: this.congeService.getTypesConge()
    }).subscribe({
      next: ({ soldes, historique, types }) => {
        this.soldes.set(soldes);
        this.historique.set(historique);
        this.typesConge.set(types);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.toastService.error(this.extractErrorMessage(error, 'Impossible de charger vos conges.'));
        this.isLoading.set(false);
        this.cdr.markForCheck();
      }
    });
    this.congeService.getJoursFeries().subscribe({
      next: res => {
        this.joursFeries.set(res);
        this.cdr.markForCheck();
      },
      error: (error) => this.toastService.error(this.extractErrorMessage(error, 'Impossible de charger les jours feries.'))
    });
  }

  onFilterChange(filter: StatutDemande | 'TOUS') {
    this.filtreStatut.set(filter);
  }

  openNewRequest() {
    this.demandeModifier.set(null);
    this.showDrawer.set(true);
  }

  onEditRequest(demande: DemandeConge) {
    this.demandeConsulter.set(null);
    this.demandeModifier.set(demande);
    this.showDrawer.set(true);
  }

  closeDrawer() {
    this.showDrawer.set(false);
    this.demandeModifier.set(null);
  }

  onCancelRequest(demande: DemandeConge) {
    this.demandeAnnuler.set(demande);
  }

  confirmAnnulation(id: number) {
    this.isAnnulating.set(true);
    this.congeService.annulerDemande(id).subscribe({
      next: () => {
        this.isAnnulating.set(false);
        this.demandeAnnuler.set(null);
        this.toastService.success('Demande annulée avec succès');
        this.refreshState();
      },
      error: (error) => {
        this.toastService.error(this.extractErrorMessage(error, 'Impossible d annuler la demande.'));
        this.isAnnulating.set(false);
      }
    });
  }

  soumettreDemande(request: NouvelleDemandeRequest) {
    const editTarget = this.demandeModifier();
    this.isSubmittingRequest.set(true);

    const operation$ = editTarget
      ? this.congeService.modifierDemande(editTarget.id, request)
      : this.congeService.soumettreDemande(request);

    operation$.subscribe({
      next: () => {
        this.isSubmittingRequest.set(false);
        this.showDrawer.set(false);
        this.demandeModifier.set(null);
        this.toastService.success(editTarget ? 'Votre demande a été modifiée avec succès' : 'Votre demande a été soumise avec succès');
        this.refreshState();
      },
      error: (error) => {
        this.toastService.error(this.extractErrorMessage(error, editTarget ? 'Impossible de modifier la demande.' : 'Impossible de soumettre la demande.'));
        this.isSubmittingRequest.set(false);
      }
    });
  }

  private refreshState() {
    forkJoin({
      soldes: this.congeService.getSoldes(),
      historique: this.congeService.getHistorique()
    }).subscribe({
      next: ({ soldes, historique }) => {
        this.soldes.set(soldes);
        this.historique.set(historique);
        this.cdr.markForCheck();
      },
      error: (error) => this.toastService.error(this.extractErrorMessage(error, 'Impossible de rafraichir les conges.'))
    });
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const source = (error ?? {}) as Record<string, any>;
    return source?.['error']?.['message'] || source?.['message'] || fallback;
  }
}
