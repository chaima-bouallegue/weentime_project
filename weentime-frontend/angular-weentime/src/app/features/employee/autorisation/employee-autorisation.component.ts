import { Component, OnInit, signal, inject, DestroyRef, ChangeDetectionStrategy, ViewEncapsulation, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Plus, ClipboardList, Clock, CheckCircle, Timer, Search, Info } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutorisationService } from '../../../core/services/autorisation.service';
import { Autorisation, StatsAutorisation } from '../../../core/models/autorisation.model';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { AssistantWorkflowService } from '../../../core/services/assistant-workflow.service';
import { AutorisationHistoryComponent } from './components/autorisation-history/autorisation-history.component';
import { AutorisationFormComponent } from './components/autorisation-form/autorisation-form.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-employee-autorisation',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    AutorisationHistoryComponent,
    AutorisationFormComponent
  ],
  template: `
    <div class="bento-container fade-in">
      <!-- Header Section -->
      <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Mes Autorisations</h1>
          <p class="text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-2xl">
            Gérez vos absences de courte durée (quelques heures) sans impact sur vos congés.
          </p>
        </div>
        
        <button 
          (click)="showForm.set(true)"
          class="action-button primary group"
        >
          <div class="button-content">
            <div class="icon-box">
              <lucide-angular [img]="iconPlus" size="20"></lucide-angular>
            </div>
            <span>Nouvelle demande</span>
          </div>
          <div class="button-glow"></div>
        </button>
      </header>

      <!-- Dashboard Grid -->
      <main class="bento-layout">
        <!-- Stats summary -->
        <div class="stats-row grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          
          <!-- Total -->
          <div class="bento-card kpi-card group" style="--card-color: #6366f1">
            <div class="card-mesh"></div>
            <div class="card-content flex items-center gap-5">
              <div class="kpi-icon-wrapper">
                <lucide-angular [img]="iconList" size="24"></lucide-angular>
              </div>
              <div>
                <div class="kpi-value">{{ kpis()?.total || 0 }}</div>
                <div class="kpi-label">Demandes déposées</div>
              </div>
            </div>
          </div>
          
          <!-- En attente -->
          <div class="bento-card kpi-card group" style="--card-color: #f59e0b">
            <div class="card-mesh"></div>
            <div class="card-content flex items-center gap-5">
              <div class="kpi-icon-wrapper">
                <lucide-angular [img]="iconClock" size="24"></lucide-angular>
              </div>
              <div>
                <div class="kpi-value">{{ kpis()?.enAttente || 0 }}</div>
                <div class="kpi-label">En attente</div>
              </div>
            </div>
          </div>

          <!-- Approuvées -->
          <div class="bento-card kpi-card group" style="--card-color: #10b981">
            <div class="card-mesh"></div>
            <div class="card-content flex items-center gap-5">
              <div class="kpi-icon-wrapper">
                <lucide-angular [img]="iconCheck" size="24"></lucide-angular>
              </div>
              <div>
                <div class="kpi-value">{{ kpis()?.approuvees || 0 }}</div>
                <div class="kpi-label">Approuvées</div>
              </div>
            </div>
          </div>

          <!-- Seuil -->
          <div class="bento-card kpi-card group" style="--card-color: #8b5cf6">
            <div class="card-mesh"></div>
            <div class="card-content flex items-center gap-5">
              <div class="kpi-icon-wrapper">
                <lucide-angular [img]="iconTimer" size="24"></lucide-angular>
              </div>
              <div>
                <div class="kpi-value">{{ kpis()?.seuil || 0 }}</div>
                <div class="kpi-label">Demandes > 2h</div>
              </div>
            </div>
          </div>
        </div>

        <!-- History Section -->
        <section class="bento-card main-section p-8">
          <div class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
            <h2 class="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
              <span class="w-2 h-8 bg-indigo-500 rounded-full"></span>
              Historique récent
            </h2>
            <div class="flex items-center gap-2">
              <div class="search-box relative">
                <lucide-angular [img]="iconSearch" size="18" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></lucide-angular>
                <input 
                  type="text" 
                  placeholder="Rechercher..." 
                  class="pl-11 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all w-64"
                >
              </div>
            </div>
          </div>
          
          <app-autorisation-history 
            [demandes]="demandes()"
            [cancellingId]="cancellingId()"
            [class.opacity-50]="isLoading()"
            (cancelRequest)="onCancelRequest($event)"
          ></app-autorisation-history>
        </section>
      </main>

      <!-- Adaptive Form Component -->
      @if (showForm()) {
        <app-autorisation-form 
          (close)="showForm.set(false)"
          (submitted)="onSubmitted()"
        ></app-autorisation-form>
      }
    </div>
  `,
  styles: [`
    .bento-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    .fade-in {
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* --- Common Bento Card --- */
    .bento-card {
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 24px;
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
      position: relative;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

      &.main-section {
        background: rgba(255, 255, 255, 0.95);
      }
    }

    .dark .bento-card {
      background: rgba(15, 23, 42, 0.6);
      border-color: rgba(255, 255, 255, 0.05);
      
      &.main-section {
        background: rgba(15, 23, 42, 0.8);
      }
    }

    /* --- KPI Cards --- */
    .kpi-card {
      height: 120px;
      padding: 1.5rem;
      
      .card-mesh {
        position: absolute;
        inset: 0;
        opacity: 0.1;
        background: radial-gradient(circle at top right, var(--card-color), transparent 70%);
        filter: blur(40px);
      }

      .card-content {
        position: relative;
        z-index: 1;
      }

      .kpi-icon-wrapper {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: white;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        color: var(--card-color);
      }

      .kpi-value {
        font-size: 1.75rem;
        font-weight: 900;
        color: #0f172a;
        line-height: 1;
        margin-bottom: 0.25rem;
      }

      .kpi-label {
        font-size: 0.875rem;
        font-weight: 600;
        color: #64748b;
      }
    }

    .dark .kpi-card {
      .kpi-icon-wrapper {
        background: rgba(255, 255, 255, 0.05);
        color: var(--card-color);
        box-shadow: none;
      }

      .kpi-value {
        color: white;
      }

      .kpi-label {
        color: #94a3b8;
      }
    }

    /* --- Action Button --- */
    .action-button {
      position: relative;
      padding: 12px 24px;
      border-radius: 16px;
      font-weight: 700;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;

      &.primary {
        background: #4f46e5;
        color: white;
        box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.3);
        
        .icon-box {
          background: rgba(255,255,255,0.2);
        }

        &:hover {
          background: #4338ca;
          transform: translateY(-2px);
          box-shadow: 0 15px 25px -5px rgba(79, 70, 229, 0.4);
        }
      }

      .button-content {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .icon-box {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class EmployeeAutorisationComponent implements OnInit {
  private service = inject(AutorisationService);
  private destroyRef = inject(DestroyRef);
  private toastService = inject(ToastService);
  private assistantWorkflow = inject(AssistantWorkflowService);
  private assistantSync = inject(AssistantSyncService);

  demandes = signal<Autorisation[]>([]);
  kpis = signal<StatsAutorisation | null>(null);
  isLoading = signal(true);
  showForm = signal(false);
  cancellingId = signal<number | null>(null);

  // Icons
  readonly iconPlus = Plus;
  readonly iconList = ClipboardList;
  readonly iconClock = Clock;
  readonly iconCheck = CheckCircle;
  readonly iconTimer = Timer;
  readonly iconSearch = Search;
  readonly iconInfo = Info;

  constructor() {
    effect(() => {
      const draft = this.assistantWorkflow.authorizationDraft();
      if (draft?.autoOpen) {
        this.showForm.set(true);
      }
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.loadKPIs();
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.actionResult?.executed && event.actionResult.tool === 'create_authorization') {
          this.loadData();
          this.loadKPIs();
        }
      });
  }

  loadData() {
    this.isLoading.set(true);
    this.service.getMesDemandes(0, 100) // Large size for now
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.demandes.set(res.content);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      });
  }

  loadKPIs() {
    this.service.getEmployeeKPIs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.kpis.set(res));
  }

  onSubmitted() {
    this.showForm.set(false);
    this.loadData();
    this.loadKPIs();
  }

  onCancelRequest(demande: Autorisation): void {
    if (this.cancellingId() || !window.confirm('Annuler cette demande d autorisation ?')) {
      return;
    }

    this.cancellingId.set(demande.id);
    this.service.annulerDemande(demande.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.cancellingId.set(null);
          this.toastService.success('Demande annulée avec succès');
          this.demandes.update(list => list.map(item => item.id === updated.id ? updated : item));
          this.loadKPIs();
        },
        error: () => {
          this.cancellingId.set(null);
        }
      });
  }
}
