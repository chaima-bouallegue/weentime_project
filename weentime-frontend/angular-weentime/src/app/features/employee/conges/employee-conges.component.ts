import { Component, signal, computed, inject, OnInit, DestroyRef, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Calendar, Info, LucideAngularModule, Plus } from 'lucide-angular';
import { CongeService } from './conge.service';
import { SoldeConge, DemandeConge, StatutDemande, NouvelleDemandeRequest, JourFerie } from './models/conge.model';
import { SoldeCardsComponent } from './components/solde-cards/solde-cards.component';
import { HistoriqueListComponent } from './components/historique-list/historique-list.component';
import { CongeCalendarComponent } from './components/conge-calendar/conge-calendar.component';
import { DemandeDrawerComponent } from './components/demande-drawer/demande-drawer.component';
import { AnnulationModalComponent } from './components/annulation-modal/annulation-modal.component';
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
    AnnulationModalComponent
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

  readonly iconPlus = Plus;
  readonly iconCalendar = Calendar;
  readonly iconInfo = Info;

  // Global State
  soldes = signal<SoldeConge[]>([]);
  historique = signal<DemandeConge[]>([]);
  joursFeries = signal<JourFerie[]>([]);

  isLoading = signal(true);
  showDrawer = signal(false);
  demandeAnnuler = signal<DemandeConge | null>(null);
  isAnnulating = signal(false);
  isSubmittingRequest = signal(false);

  filtreStatut = signal<StatutDemande | 'TOUS'>('TOUS');

  historiqueFiltre = computed(() => {
    const list = this.historique();
    const filter = this.filtreStatut();
    return filter === 'TOUS' ? list : list.filter(d => d.statut === filter);
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
      historique: this.congeService.getHistorique()
    }).subscribe({
      next: ({ soldes, historique }) => {
        this.soldes.set(soldes);
        this.historique.set(historique);
        this.isLoading.set(false);
      },
      error: (error) => {
        this.toastService.error(this.extractErrorMessage(error, 'Impossible de charger vos conges.'));
        this.isLoading.set(false);
      }
    });
    this.congeService.getJoursFeries().subscribe({
      next: res => this.joursFeries.set(res),
      error: (error) => this.toastService.error(this.extractErrorMessage(error, 'Impossible de charger les jours feries.'))
    });
  }

  onFilterChange(filter: StatutDemande | 'TOUS') {
    this.filtreStatut.set(filter);
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
    this.isSubmittingRequest.set(true);
    this.congeService.soumettreDemande(request).subscribe({
      next: () => {
        this.isSubmittingRequest.set(false);
        this.showDrawer.set(false);
        this.toastService.success('Votre demande a été soumise avec succès');
        this.refreshState();
      },
      error: (error) => {
        this.toastService.error(this.extractErrorMessage(error, 'Impossible de soumettre la demande.'));
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
      },
      error: (error) => this.toastService.error(this.extractErrorMessage(error, 'Impossible de rafraichir les conges.'))
    });
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const source = (error ?? {}) as Record<string, any>;
    return source?.['error']?.['message'] || source?.['message'] || fallback;
  }
}
