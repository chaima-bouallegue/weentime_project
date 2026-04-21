import { Component, OnInit, signal, computed, inject, DestroyRef, ChangeDetectionStrategy, ViewEncapsulation, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Laptop, Clock, CheckCircle, Info, Calendar, Monitor, Home, Plus, Search, Filter, Sparkles, AlertCircle } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TeletravailService } from './teletravail.service';
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
import { AnnulationTeletravailModalComponent } from './components/annulation-teletravail-modal/annulation-teletravail-modal.component';
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
    AnnulationTeletravailModalComponent
  ],
  templateUrl: './employee-teletravail.component.html',
  styleUrl: './employee-teletravail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class EmployeeTeletravailComponent implements OnInit {
  private teletravailService = inject(TeletravailService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private assistantWorkflow = inject(AssistantWorkflowService);
  private assistantSync = inject(AssistantSyncService);

  // Icons
  readonly iconLaptop = Laptop;
  readonly iconClock = Clock;
  readonly iconCheck = CheckCircle;
  readonly iconInfo = Info;
  readonly iconCalendar = Calendar;
  readonly iconMonitor = Monitor;
  readonly iconHome = Home;
  readonly iconPlus = Plus;
  readonly iconSearch = Search;
  readonly iconFilter = Filter;
  readonly iconSparkles = Sparkles;
  readonly iconAlert = AlertCircle;

  quota = signal<QuotaTeletravail | null>(null);
  historique = signal<DemandeTeletravail[]>([]);
  holidayDates = signal<string[]>([]);
  isLoading = signal(true);
  showDrawer = signal(false);
  demandeAnnuler = signal<DemandeTeletravail | null>(null);
  filtreStatut = signal<StatutTeletravail | 'TOUS'>('TOUS');
  isAnnulating = signal(false);
  currentDate = signal<string>('');

  historiqueFiltre = computed(() =>
    this.filtreStatut() === 'TOUS'
      ? this.historique()
      : this.historique().filter(d => d.statut === this.filtreStatut())
  );

  joursRestants = computed(() => this.quota()?.joursRestants ?? 0);

  approvedDates = computed(() => 
    this.historique()
      .filter(d => d.statut === 'APPROUVE')
      .map(d => d.dateDebut) // Simple mapping for single days
  );

  halfDayDates = computed(() => 
    this.historique()
      .filter(d => d.statut === 'APPROUVE' && d.periode)
      .map(d => ({ date: d.dateDebut, periode: d.periode! }))
  );

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
    this.loadData();
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
    this.currentDate.set(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  }

  loadData(): void {
    this.isLoading.set(true);
    this.teletravailService.getQuota()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.quota.set(res));
    
    this.teletravailService.getJoursFeries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.holidayDates.set(res));

    this.teletravailService.getHistorique()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => {
        this.historique.set(res);
        this.isLoading.set(false);
      });
  }

  onFilterChange(filter: StatutTeletravail | 'TOUS'): void {
    this.filtreStatut.set(filter);
  }

  onCancelRequest(demande: DemandeTeletravail): void {
    this.demandeAnnuler.set(demande);
  }

  confirmAnnulation(id: number): void {
    this.isAnnulating.set(true);
    this.teletravailService.annulerDemande(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isAnnulating.set(false);
          this.demandeAnnuler.set(null);
          this.toastService.success('Demande annulée avec succès');
          this.refreshData();
        },
        error: () => this.isAnnulating.set(false)
      });
  }

  soumettreDemande(request: NouvelleDemandeTeletravailRequest): void {
    this.teletravailService.soumettreDemande(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showDrawer.set(false);
          this.toastService.success('Votre demande de télétravail a été soumise');
          this.refreshData();
        }
      });
  }

  private refreshData(): void {
    this.teletravailService.getQuota().subscribe(res => this.quota.set(res));
    this.teletravailService.getHistorique().subscribe(res => this.historique.set(res));
  }
}
