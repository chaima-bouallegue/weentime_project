import { Component, OnInit, signal, computed, inject, DestroyRef, ChangeDetectorRef, ViewEncapsulation, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Clock, Info, Calendar, Monitor, Plus, Sparkles } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TeletravailService } from './teletravail.service';
import { TeletravailStore } from './teletravail.store';
import {
  QuotaTeletravail,
  DemandeTeletravail,
  StatutTeletravail,
  NouvelleDemandeTeletravailRequest
} from './models/teletravail.model';
import { QuotaCardComponent } from './components/quota-card/quota-card.component';
import { TeletravailHistoriqueComponent } from './components/teletravail-historique/teletravail-historique.component';
import { TeletravailCalendarComponent } from './components/teletravail-calendar/teletravail-calendar.component';
import { DemandeTeletravailDrawerComponent } from './components/demande-teletravail-drawer/demande-teletravail-drawer.component';
import { ConfirmCancellationModalComponent, CancellationPreviewItem } from '../../../shared/components/confirm-cancellation-modal';
import { ConsultationTeletravailModalComponent } from './components/consultation-teletravail-modal/consultation-teletravail-modal.component';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { AssistantWorkflowService } from '../../../core/services/assistant-workflow.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-employee-teletravail',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    QuotaCardComponent,
    TeletravailHistoriqueComponent,
    TeletravailCalendarComponent,
    DemandeTeletravailDrawerComponent,
    ConfirmCancellationModalComponent,
    ConsultationTeletravailModalComponent
  ],
  templateUrl: './employee-teletravail.component.html',
  styleUrl: './employee-teletravail.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class EmployeeTeletravailComponent implements OnInit {
  private teletravailService = inject(TeletravailService);
  public store = inject(TeletravailStore);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private cdr = inject(ChangeDetectorRef);
  private assistantWorkflow = inject(AssistantWorkflowService);
  private assistantSync = inject(AssistantSyncService);

  // Icons
  readonly iconClock    = Clock;
  readonly iconInfo     = Info;
  readonly iconCalendar = Calendar;
  readonly iconMonitor  = Monitor;
  readonly iconPlus     = Plus;
  readonly iconSparkles = Sparkles;

  // Store refs
  quota      = this.store.quota;
  historique = this.store.historique;
  holidayDates = this.store.holidayDates;
  isLoading  = this.store.isLoading;

  // UI state
  showDrawer        = signal(false);
  demandeModifier   = signal<DemandeTeletravail | null>(null);
  demandeAnnuler    = signal<DemandeTeletravail | null>(null);
  demandeConsulter  = signal<DemandeTeletravail | null>(null);
  filtreStatut      = signal<StatutTeletravail | 'TOUS' | 'EN_ATTENTE'>('TOUS');
  isAnnulating      = signal(false);
  isSubmittingRequest = signal(false);
  afficherTout      = signal(false);
  currentDate       = signal<string>('');

  // Computed
  historiqueFiltre = computed(() => {
    const all = this.historique();
    let filtered: DemandeTeletravail[];
    const current = this.filtreStatut();
    if (current === 'TOUS') {
      filtered = all;
    } else if (current === 'EN_ATTENTE') {
      filtered = all.filter(d => d.statut === 'EN_ATTENTE' || d.statut === 'EN_ATTENTE_MANAGER' || d.statut === 'EN_ATTENTE_RH');
    } else if (current === 'APPROUVE') {
      filtered = all.filter(d => d.statut === 'APPROUVE' || d.statut === 'APPROUVEE' || d.statut === 'VALIDEE');
    } else if (current === 'REFUSE') {
      filtered = all.filter(d => d.statut === 'REFUSE' || d.statut === 'REFUSEE');
    } else if (current === 'ANNULE') {
      filtered = all.filter(d => d.statut === 'ANNULE' || d.statut === 'ANNULEE');
    } else {
      filtered = all.filter(d => d.statut === current);
    }
    return this.afficherTout() ? filtered : filtered.slice(0, 5);
  });

  joursRestants = computed(() => this.quota()?.joursRestants ?? 0);

  approvedDates = computed(() =>
    this.historique()
      .filter(d => d.statut === 'APPROUVE' || d.statut === 'APPROUVEE' || d.statut === 'VALIDEE')
      .map(d => d.dateDebut)
  );

  halfDayDates = computed(() =>
    this.historique()
      .filter(d => (d.statut === 'APPROUVE' || d.statut === 'APPROUVEE' || d.statut === 'VALIDEE') && d.periode)
      .map(d => ({ date: d.dateDebut, periode: d.periode! }))
  );

  teletravailCancellationPreviewItems = computed<CancellationPreviewItem[]>(() => {
    const d = this.demandeAnnuler();
    if (!d) return [];
    return [
      { label: 'Type', value: d.label || d.type, highlight: true },
      { label: 'Date', value: d.dateDebut === d.dateFin ? d.dateDebut : `Du ${d.dateDebut} au ${d.dateFin}` },
      { label: 'Durée', value: `${d.nombreJours} ${d.nombreJours > 1 ? 'jours' : 'jour'}` }
    ];
  });

  constructor() {
    effect(() => {
      const draft = this.assistantWorkflow.teleworkDraft();
      if (draft?.autoOpen) {
        this.showDrawer.set(true);
      }
    });
  }

  ngOnInit(): void {
    this.updateDate();
    this.store.loadAll().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.cdr.markForCheck();
    });
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.actionResult?.executed && event.actionResult.tool === 'create_telework') {
          this.refreshData();
        }
      });
  }

  private updateDate(): void {
    const now = new Date();
    this.currentDate.set(
      now.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
    );
  }

  onFilterChange(filter: StatutTeletravail | 'TOUS' | 'EN_ATTENTE'): void {
    this.filtreStatut.set(filter);
    this.afficherTout.set(false);
    this.cdr.markForCheck();
  }

  openNewRequest(): void {
    this.demandeModifier.set(null);
    this.showDrawer.set(true);
    this.cdr.markForCheck();
  }

  closeDrawer(): void {
    this.showDrawer.set(false);
    this.demandeModifier.set(null);
    this.cdr.markForCheck();
  }

  onCancelRequest(demande: DemandeTeletravail): void {
    this.demandeAnnuler.set(demande);
    this.cdr.markForCheck();
  }

  onEditRequest(demande: DemandeTeletravail): void {
    this.demandeConsulter.set(null);
    this.demandeModifier.set(demande);
    this.showDrawer.set(true);
    this.cdr.markForCheck();
  }

  confirmAnnulation(id: number): void {
    this.isAnnulating.set(true);
    this.cdr.markForCheck();
    this.teletravailService.annulerDemande(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isAnnulating.set(false);
          this.demandeAnnuler.set(null);
          this.refreshData();
        },
        error: () => {
          this.isAnnulating.set(false);
          this.cdr.markForCheck();
        }
      });
  }

  soumettreDemande(request: NouvelleDemandeTeletravailRequest): void {
    const editTarget = this.demandeModifier();
    this.isSubmittingRequest.set(true);
    this.cdr.markForCheck();

    const operation$ = editTarget
      ? this.teletravailService.modifierDemande(editTarget.id, request)
      : this.teletravailService.soumettreDemande(request);

    operation$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSubmittingRequest.set(false);
          this.showDrawer.set(false);
          this.demandeModifier.set(null);
          this.refreshData();
        },
        error: () => {
          this.isSubmittingRequest.set(false);
          this.cdr.markForCheck();
        }
      });
  }

  private refreshData(): void {
    this.store.refresh().pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.cdr.markForCheck();
    });
  }
}
