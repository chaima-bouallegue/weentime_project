import { Component, OnInit, signal, computed, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
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
    <div class="min-h-screen bg-gray-50/50 dark:bg-gray-950 p-4 md:p-8 transition-colors duration-300">
      <header class="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">Console RH — Autorisations</h1>
          <p class="text-gray-500 dark:text-gray-400 mt-1">Supervision globale et validation finale des absences de courte durée.</p>
        </div>
        
        <div class="flex items-center gap-2 p-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm">
          <button 
            (click)="filterStatut.set('TOUS')"
            [class.bg-gray-100]="filterStatut() === 'TOUS'"
            [class.dark:bg-gray-800]="filterStatut() === 'TOUS'"
            [class.text-indigo-600]="filterStatut() === 'TOUS'"
            [class.dark:text-indigo-400]="filterStatut() === 'TOUS'"
            class="px-4 py-2 text-xs font-bold rounded-lg transition-all dark:text-gray-400"
          >Tous</button>
          <button 
            (click)="filterStatut.set(StatutAutorisation.EN_ATTENTE_RH)"
            [class.bg-indigo-600]="filterStatut() === StatutAutorisation.EN_ATTENTE_RH"
            [class.text-white]="filterStatut() === StatutAutorisation.EN_ATTENTE_RH"
            class="px-4 py-2 text-xs font-bold rounded-lg transition-all dark:text-gray-400"
          >À Valider (RH)</button>
        </div>
      </header>

      <main class="max-w-7xl mx-auto">
        <div class="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-xl overflow-hidden transition-all">
          <!-- Quick stats bar -->
          <div class="grid grid-cols-2 md:grid-cols-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/30">
            <div class="p-4 border-r border-gray-100 dark:border-gray-800 text-center">
              <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Total Entreprise</span>
              <span class="text-xl font-black text-gray-900 dark:text-white">{{ kpis()?.total || 0 }}</span>
            </div>
            <div class="p-4 border-r border-gray-100 dark:border-gray-800 text-center">
              <span class="block text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">En attente RH</span>
              <span class="text-xl font-black text-indigo-600 dark:text-indigo-400">{{ kpis()?.enAttente || 0 }}</span>
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
                          <button (click)="onDecision(item.id, true)" class="p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all font-bold" title="Approuver">
                            <lucide-icon name="check" size="18"></lucide-icon>
                          </button>
                        </div>
                      } @else {
                        <button class="p-2 text-gray-300 dark:text-gray-600 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100">
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
    :host { display: block; }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhAutorisationComponent implements OnInit {
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
