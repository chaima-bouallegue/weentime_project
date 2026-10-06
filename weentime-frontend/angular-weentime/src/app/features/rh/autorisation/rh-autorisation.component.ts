import { Component, OnInit, signal, computed, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ShieldCheck } from 'lucide-angular';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutorisationService } from '../../../core/services/autorisation.service';
import { Autorisation, StatutAutorisation, TypeAutorisation, StatsAutorisation } from '../../../core/models/autorisation.model';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-rh-autorisation',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  template: `
    <div class="autorisation-page">
      <!-- Standardized WeenTime Header (Identical to Congés) -->
      <header class="page-header">
        <div class="page-header__row">
          <div class="header-title-group">
            <div class="header-icon-box">
              <lucide-icon [img]="ShieldCheckIcon" size="24"></lucide-icon>
            </div>
            <div>
              <h1 class="page-title">Console RH — Autorisations</h1>
              <p class="page-subtitle">Supervision globale et validation finale des absences de courte durée</p>
            </div>
          </div>
          
          <div class="page-header__actions">
            <div class="filter-pills-bar">
              <button 
                type="button"
                (click)="filterStatut.set('TOUS')"
                class="filter-pill"
                [class.is-active]="filterStatut() === 'TOUS'">
                Tous
              </button>
              <button 
                type="button"
                (click)="filterStatut.set(StatutAutorisation.EN_ATTENTE_RH)"
                class="filter-pill"
                [class.is-active]="filterStatut() === StatutAutorisation.EN_ATTENTE_RH">
                À Valider (RH)
                @if (kpis()?.enAttente) {
                  <span class="pill-badge">{{ kpis()?.enAttente }}</span>
                }
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="w-full">
        <div class="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden transition-all">
          <!-- Quick stats bar -->
          <div class="grid grid-cols-2 md:grid-cols-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/30">
            <div class="p-4 border-r border-gray-100 dark:border-gray-800 text-center">
              <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Total Entreprise</span>
              <span class="text-xl font-black text-gray-900 dark:text-white">{{ kpis()?.total || 0 }}</span>
            </div>
            <div class="p-4 border-r border-gray-100 dark:border-gray-800 text-center">
              <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">En attente RH</span>
              <span class="text-xl font-black text-purple-600 dark:text-purple-400">{{ kpis()?.enAttente || 0 }}</span>
            </div>
            <div class="p-4 border-r border-gray-100 dark:border-gray-800 text-center text-emerald-600 dark:text-emerald-400">
              <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 font-normal">Approuvées</span>
              <span class="text-xl font-black">{{ kpis()?.approuvees || 0 }}</span>
            </div>
            <div class="p-4 text-center">
              <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1 font-normal">Taux de validation</span>
              <span class="text-xl font-black text-gray-900 dark:text-white">--</span>
            </div>
          </div>

          <!-- Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="bg-gray-50/50 dark:bg-gray-800/50 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 tracking-widest">
                <tr>
                  <th class="px-6 py-4">Collaborateur</th>
                  <th class="px-6 py-4">Type & Date</th>
                  <th class="px-6 py-4">Durée</th>
                  <th class="px-6 py-4">Statut actuel</th>
                  <th class="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-50 dark:divide-gray-800">
                @for (item of filteredDemandes(); track item.id) {
                  <tr class="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors group">
                    <td class="px-6 py-4">
                      <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                          {{ getInitials(item.nomComplet) }}
                        </div>
                        <span class="font-bold text-gray-900 dark:text-white">{{ item.nomComplet }}</span>
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col">
                        <span class="font-medium text-gray-700 dark:text-gray-200">{{ formatType(item.typeAutorisation) }}</span>
                        <span class="text-xs text-gray-400 dark:text-gray-500">{{ item.dateAutorisation | date:'dd/MM/yyyy' }}</span>
                      </div>
                    </td>
                    <td class="px-6 py-4">
                      <span class="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-md text-[11px] font-bold text-gray-600 dark:text-gray-400">{{ formatDuree(item.duree) }}</span>
                    </td>
                    <td class="px-6 py-4">
                      <span [class]="getStatusClass(item.statut)" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-tighter transition-colors">
                        {{ formatStatut(item.statut) }}
                      </span>
                    </td>
                    <td class="px-6 py-4 text-right">
                      @if (item.statut === StatutAutorisation.EN_ATTENTE_RH) {
                        <div class="flex justify-end gap-2">
                          <button (click)="onDecision(item.id, false)" class="p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all" title="Refuser">
                            <lucide-icon name="x" size="18"></lucide-icon>
                          </button>
                          <button (click)="onDecision(item.id, true)" class="p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-lg transition-all font-bold" title="Approuver">
                            <lucide-icon name="check" size="18"></lucide-icon>
                          </button>
                        </div>
                      } @else {
                        <button class="p-2 text-gray-300 dark:text-gray-600 hover:text-purple-600 dark:hover:text-purple-400 transition-colors opacity-0 group-hover:opacity-100">
                          <lucide-icon name="eye" size="18"></lucide-icon>
                        </button>
                      }
                    </td>
                  </tr>
                } @empty {
                   <tr>
                    <td colspan="5" class="px-6 py-12 text-center text-gray-400 dark:text-gray-600 italic">
                      Aucune demande trouvée.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      font-family: 'DM Sans', 'Plus Jakarta Sans', sans-serif;
      color: #111827;
      width: 100%;
    }

    .autorisation-page {
      width: 100%;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-header__row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-title-group {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .header-icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%);
      border: 1px solid #c4b5fd;
      color: var(--primary, #6B5DD3);
      flex-shrink: 0;
      box-shadow: 0 2px 5px rgba(107, 93, 211, 0.08);
    }

    :host-context(.dark) .header-icon-box,
    .dark .header-icon-box {
      background: linear-gradient(135deg, rgba(107, 93, 211, 0.2) 0%, rgba(107, 93, 211, 0.1) 100%);
      border-color: rgba(107, 93, 211, 0.3);
      color: #a78bfa;
    }

    .page-title {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: -0.02em;
    }

    :host-context(.dark) .page-title,
    .dark .page-title {
      color: #f1f5f9;
    }

    .page-subtitle {
      margin: 4px 0 0;
      font-size: 13px;
      color: #64748b;
    }

    :host-context(.dark) .page-subtitle,
    .dark .page-subtitle {
      color: #94a3b8;
    }

    .page-header__actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .filter-pills-bar {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      background: #f1f5f9;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
    }

    :host-context(.dark) .filter-pills-bar,
    .dark .filter-pills-bar {
      background: #1e293b;
      border-color: #334155;
    }

    .filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      color: #64748b;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        color: #0f172a;
      }

      &.is-active {
        background: #ffffff;
        color: var(--primary, #6B5DD3);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
      }
    }

    :host-context(.dark) .filter-pill,
    .dark .filter-pill {
      color: #94a3b8;

      &:hover {
        color: #f1f5f9;
      }

      &.is-active {
        background: #0f172a;
        color: #a78bfa;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
    }

    .pill-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 18px;
      height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      background: var(--primary, #6B5DD3);
      color: #fff;
      font-size: 10px;
      font-weight: 700;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhAutorisationComponent implements OnInit {
  readonly ShieldCheckIcon = ShieldCheck;

  private service = inject(AutorisationService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  StatutAutorisation = StatutAutorisation;

  demandes = signal<Autorisation[]>([]);
  kpis = signal<StatsAutorisation | null>(null);
  isLoading = signal(true);
  filterStatut = signal<'TOUS' | StatutAutorisation>('TOUS');

  filteredDemandes = computed(() => {
    const list = this.demandes();
    const filter = this.filterStatut();
    if (filter === 'TOUS') return list;
    return list.filter(d => d.statut === filter);
  });

  ngOnInit(): void {
    this.loadData();
    this.loadKPIs();
  }

  loadData() {
    this.isLoading.set(true);
    this.service.getDemandesEntreprise()
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
    this.service.getRhKPIs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.kpis.set(res));
  }

  getInitials(name?: string): string {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  formatType(type: TypeAutorisation): string {
    const types: Record<string, string> = {
      'SORTIE_ANTICIPEE': 'Sortie anticipée',
      'ARRIVEE_TARDIVE': 'Arrivée tardive',
      'RDV_MEDICAL': 'RDV Médical',
      'PAUSE_LONGUE': 'Pause longue',
      'TELETRAVAIL_EXCEPTIONNEL': 'Télétravail exp.',
      'MI_TEMPS_EXCEPTIONNEL': 'Mi-temps exp.'
    };
    return types[type] || type;
  }

  formatStatut(statut: StatutAutorisation): string {
    const statuts: Record<string, string> = {
      'EN_ATTENTE_MANAGER': 'Attente Manager',
      'EN_ATTENTE_RH': 'Attente RH',
      'APPROUVE': 'Approuvé',
      'REFUSE': 'Refusé'
    };
    return statuts[statut] || statut;
  }

  formatDuree(minutes: number): string {
    if (!minutes) return '0min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}min` : `${m}min`;
  }

  getStatusClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER: return 'bg-amber-50 text-amber-700 border-amber-200';
      case StatutAutorisation.EN_ATTENTE_RH: return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case StatutAutorisation.APPROUVE: return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case StatutAutorisation.REFUSE: return 'bg-rose-50 text-rose-700 border-rose-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  }

  onDecision(id: number, approved: boolean) {
    this.service.deciderRH(id, approved).subscribe(() => {
      this.toastService.success(approved ? 'Demande validée (Fin du processus)' : 'Demande refusée');
      this.loadData();
      this.loadKPIs();
    });
  }
}
