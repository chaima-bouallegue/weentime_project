import { Component, OnInit, inject, signal, effect, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  LucideAngularModule, 
  LUCIDE_ICONS,
  LucideIconProvider,
  Wallet, 
  History, 
  Database, 
  UserPlus, 
  AlertTriangle, 
  ChevronDown, 
  Search, 
  Check, 
  AlertCircle, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Loader2 
} from 'lucide-angular';
import { debounceTime, distinctUntilChanged, Subject } from 'rxjs';
import { RhSoldeService, EmployeeSolde, SoldeDetail } from '../services/rh-solde.service';


@Component({
  selector: 'app-rh-soldes-manager',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    LucideAngularModule
  ],
  template: `
    <div class="flex flex-col gap-6 animate-in fade-in duration-500 pb-20">
      
      <!-- Top Action Bar (Fixed when scrolling) -->
      <div class="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 -mx-4 px-4 py-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div class="flex items-center gap-4">
          <h2 class="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <lucide-icon name="wallet" class="text-indigo-600"></lucide-icon>
            Soldes Collaborateurs
          </h2>
          
          <!-- Bulk Actions -->
          @if (selectedEmployeeIds().size > 0) {
            <div class="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-500/10 px-4 py-2 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 animate-in slide-in-from-left-4">
              <span class="text-sm font-bold text-indigo-600 dark:text-indigo-400">{{ selectedEmployeeIds().size }} sélectionnés</span>
              <div class="h-4 w-px bg-indigo-200 dark:bg-indigo-500/30 mx-2"></div>
              <button (click)="initialiserSelection()" class="text-xs font-black uppercase text-indigo-600 hover:text-indigo-700">Initialiser</button>
            </div>
          }
        </div>

        <div class="flex items-center gap-3">
          <button (click)="initialiserNouveaux()" class="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-tight transition-all shadow-lg shadow-indigo-100 dark:shadow-none">
            <lucide-icon name="user-plus" size="16"></lucide-icon>
            Initialiser Nouveaux
          </button>
          
          <button (click)="openResetModal()" class="flex items-center gap-2 px-5 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl text-xs font-black uppercase tracking-tight transition-all">
            <lucide-icon name="alert-triangle" size="16"></lucide-icon>
            Réinitialisation Annuelle
          </button>
        </div>
      </div>

      <!-- Filters & Search -->
      <div class="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-800/50 p-4 rounded-[2rem] border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
        
        <!-- Tabs -->
        <div class="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
          @for (tab of tabs; track tab.id) {
            <button 
              (click)="activeTab.set(tab.id)"
              [class.bg-white]="activeTab() === tab.id"
              [class.shadow-sm]="activeTab() === tab.id"
              [class.text-indigo-600]="activeTab() === tab.id"
              class="px-6 py-2 rounded-xl text-xs font-bold transition-all text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
              {{ tab.label }}
            </button>
          }
        </div>

        <div class="flex items-center gap-4 w-full md:w-auto">
          <!-- Year Selector -->
          <div class="relative min-w-[120px]">
            <select [(ngModel)]="selectedYear" (change)="loadSoldes()" class="w-full pl-4 pr-10 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border-none text-sm font-bold text-slate-700 dark:text-slate-200 appearance-none outline-none focus:ring-2 focus:ring-indigo-500/20">
              @for (yr of years; track yr) {
                <option [value]="yr">{{ yr }}</option>
              }
            </select>
            <lucide-icon name="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" size="16"></lucide-icon>
          </div>

          <!-- Search -->
          <div class="relative flex-1 md:w-64">
            <lucide-icon name="search" class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size="18"></lucide-icon>
            <input 
              type="text" 
              [(ngModel)]="searchQuery"
              (ngModelChange)="onSearchChange($event)"
              placeholder="Rechercher un employé..." 
              class="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl border-none text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 dark:text-slate-200">
          </div>
        </div>
      </div>

      <!-- Global Feedback -->
      @if (status()) {
        <div class="animate-in slide-in-from-top-4 duration-300 px-6 py-4 rounded-3xl flex items-center justify-between gap-3 border shadow-sm w-full"
             [ngClass]="status()?.type === 'success' ? 'bg-emerald-50 border-emerald-100/50 text-emerald-700' : 'bg-rose-50 border-rose-100/50 text-rose-700'">
          <div class="flex items-center gap-3">
            <lucide-icon [name]="status()?.type === 'success' ? 'check' : 'alert-circle'" size="20"></lucide-icon>
            <span class="text-sm font-bold">{{ status()?.message }}</span>
          </div>
          <button (click)="status.set(null)" class="text-current opacity-50 hover:opacity-100">
            <lucide-icon name="x" size="16"></lucide-icon>
          </button>
        </div>
      }

      <!-- Table View -->
      <div class="bg-white dark:bg-slate-800/50 rounded-[2.5rem] border border-slate-200/60 dark:border-slate-700/50 shadow-sm overflow-hidden min-h-[400px] relative">
        @if (loading()) {
          <div class="absolute inset-0 z-30 bg-white/60 dark:bg-slate-900/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4">
            <div class="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">Synchronisation...</span>
          </div>
        }

        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700/50">
                <th class="p-6 w-12">
                   <input type="checkbox" (change)="toggleAll($event)" [checked]="isAllSelected()" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                </th>
                <th class="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Collaborateur</th>
                @for (type of leaveTypes(); track type.id) {
                  <th class="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                    {{ type.libelle }}
                  </th>
                }
                <th class="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Statut</th>
                <th class="p-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 dark:divide-slate-700/50">
              @for (emp of employees(); track emp.utilisateurId) {
                <tr class="group hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-all">
                  <td class="p-6">
                    <input type="checkbox" (change)="toggleSelection(emp.utilisateurId)" [checked]="selectedEmployeeIds().has(emp.utilisateurId)" class="rounded border-slate-300 text-indigo-600">
                  </td>
                  <td class="p-6">
                    <div class="flex items-center gap-3">
                      <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                        {{ emp.prenom[0] }}{{ emp.nom[0] }}
                      </div>
                      <div>
                        <span class="block text-sm font-extrabold text-slate-800 dark:text-white">{{ emp.prenom }} {{ emp.nom }}</span>
                        <span class="text-[10px] font-medium text-slate-400 tracking-tight italic">ID: #{{ emp.utilisateurId }}</span>
                      </div>
                    </div>
                  </td>
                  @for (type of leaveTypes(); track type.id) {
                    <td class="p-6">
                      @if (getSolde(emp.soldes, type.id); as solde) {
                        <div class="flex flex-col items-center gap-2 group/solde">
                          <div class="flex items-baseline gap-1">
                            <span class="text-sm font-black text-slate-800 dark:text-white italic">{{ solde.joursRestants }}</span>
                            <span class="text-[9px] text-slate-400 uppercase font-black">/ {{ solde.joursMax }}</span>
                          </div>
                          <!-- Progress Bar -->
                          <div class="w-20 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div class="h-full transition-all duration-500" 
                                 [ngClass]="getProgressColor(solde.joursRestants, solde.joursMax)"
                                 [style.width.%]="(solde.joursRestants / solde.joursMax) * 100">
                            </div>
                          </div>
                          <button (click)="openEditModal(emp, solde)" class="mt-1 opacity-0 group-hover/solde:opacity-100 text-[9px] font-black text-indigo-600 uppercase transition-opacity">Ajuster</button>
                        </div>
                      } @else {
                        <div class="text-center">
                          <span class="text-xl text-slate-300 dark:text-slate-600 font-light">-</span>
                        </div>
                      }
                    </td>
                  }
                  <td class="p-6 text-center">
                    <span [ngClass]="emp.isInitialised ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'"
                          class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter">
                      {{ emp.isInitialised ? 'Initialisé' : 'Non initialisé' }}
                    </span>
                  </td>
                  <td class="p-6 text-right">
                    <button (click)="loadHistory(emp)" class="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                      <lucide-icon name="history" size="18"></lucide-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          
          @if (employees().length === 0 && !loading()) {
            <div class="py-20 flex flex-col items-center gap-4 text-slate-400">
              <lucide-icon name="database" size="48" class="opacity-20"></lucide-icon>
              <span class="text-xs font-black uppercase italic tracking-widest">Aucune donnée trouvée</span>
            </div>
          }
        </div>
      </div>

      <!-- Pagination -->
      <div class="flex items-center justify-between bg-white dark:bg-slate-800/50 p-4 rounded-3xl border border-slate-200/60 dark:border-slate-700/50">
        <span class="text-xs font-bold text-slate-500">
          Page {{ currentPage() + 1 }} sur {{ totalPages() }}
        </span>
        <div class="flex items-center gap-2">
          <button (click)="changePage(currentPage() - 1)" [disabled]="currentPage() === 0" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 disabled:opacity-30">
            <lucide-icon name="chevron-left" size="18"></lucide-icon>
          </button>
          <button (click)="changePage(currentPage() + 1)" [disabled]="currentPage() >= totalPages() - 1" class="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 disabled:opacity-30">
            <lucide-icon name="chevron-right" size="18"></lucide-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    @if (editing()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md" (click)="closeEditModal()"></div>
        <div class="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
          <div class="p-8 space-y-6">
            <div class="flex items-center justify-between">
              <h3 class="text-xl font-extrabold text-slate-800 dark:text-white">Ajuster le <span class="text-indigo-600">solde</span></h3>
              <button (click)="closeEditModal()" class="text-slate-400 hover:text-red-500 transition-colors"><lucide-icon name="x"></lucide-icon></button>
            </div>
            
            <div class="bg-indigo-50 dark:bg-indigo-500/5 p-4 rounded-2xl">
              <span class="block text-[10px] font-black text-indigo-400 uppercase mb-1">Employé & Type</span>
              <span class="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                {{ editing()?.user?.prenom }} {{ editing()?.user?.nom }} - {{ editing()?.solde?.typeNom }}
              </span>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Nouveau solde (jours)</label>
                <input type="number" step="0.5" [(ngModel)]="newJours" class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-2xl text-xl font-black focus:ring-2 focus:ring-indigo-500 outline-none text-center">
              </div>
              <div>
                <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Motif de l'ajustement</label>
                <textarea [(ngModel)]="motif" placeholder="Raison de la modification..." class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-2xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none h-24"></textarea>
              </div>
            </div>

            <button (click)="saveAdjustment()" [disabled]="saving()" class="w-full py-4 bg-indigo-600 hover:bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest transition-all disabled:opacity-50">
              @if (saving()) { <lucide-icon name="loader-2" class="animate-spin inline mr-2"></lucide-icon> }
              Confirmer l'ajustement
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Reset Confirmation Modal -->
    @if (showResetModal()) {
      <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" (click)="closeResetModal()"></div>
        <div class="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden border border-rose-100 dark:border-rose-900/30 scale-100 animate-in zoom-in-95 duration-300">
          <div class="p-8 text-center">
            <div class="w-16 h-16 bg-rose-50 dark:bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <lucide-icon name="alert-triangle" size="32"></lucide-icon>
            </div>
            <h3 class="text-xl font-extrabold text-slate-800 dark:text-white mb-2 tracking-tight">Réinitialisation Annuelle ⚠️</h3>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400">Tous les compteurs pour l'année <b>{{ selectedYear() }}</b> seront remis à zéro.</p>
            
            <div class="mt-6 flex flex-col gap-3">
              <button (click)="confirmAnnualReset()" class="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-rose-200 dark:shadow-none">
                Confirmer l'opération
              </button>
              <button (click)="closeResetModal()" class="py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Annuler</button>
            </div>
          </div>
        </div>
      </div>
    }

    <!-- Audit Timeline Modal -->
    @if (showAuditModal()) {
      <div class="fixed inset-0 z-[120] flex items-center justify-end animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="closeAuditModal()"></div>
        
        <div class="relative bg-white dark:bg-slate-900 h-full w-full max-w-md shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 border-l border-slate-200 dark:border-slate-800">
          
          <!-- Header -->
          <div class="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
            <div>
              <h3 class="text-xl font-black text-slate-800 dark:text-white tracking-tight">Historique <span class="text-indigo-600 italic">Audit</span></h3>
              <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {{ selectedAuditUser()?.prenom }} {{ selectedAuditUser()?.nom }}
              </p>
            </div>
            <button (click)="closeAuditModal()" class="w-10 h-10 flex items-center justify-center rounded-2xl bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 transition-all border border-slate-100 dark:border-slate-700 shadow-sm">
              <lucide-icon name="x" size="20"></lucide-icon>
            </button>
          </div>

          <!-- Timeline Content -->
          <div class="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
            @if (auditLogs().length === 0) {
              <div class="h-full flex flex-col items-center justify-center text-center gap-4 opacity-40">
                <lucide-icon name="history" size="48" class="text-slate-300"></lucide-icon>
                <p class="text-xs font-black uppercase tracking-widest">Aucun historique disponible</p>
              </div>
            } @else {
              <div class="relative border-l-2 border-slate-100 dark:border-slate-800 ml-3 pl-8 space-y-10">
                @for (log of auditLogs(); track log.id) {
                  <div class="relative">
                    <!-- Dot -->
                    <div class="absolute -left-[41px] top-0 w-5 h-5 rounded-full border-4 border-white dark:border-slate-900 z-10"
                         [ngClass]="log.action === 'MANUAL_ADJUSTMENT' ? 'bg-amber-500' : (log.action === 'ANNUAL_RESET' ? 'bg-rose-500' : 'bg-emerald-500')"></div>
                    
                    <div class="space-y-3">
                      <div class="flex items-center justify-between">
                        <span class="text-[9px] font-black uppercase tracking-tighter px-2 py-0.5 rounded-md"
                              [ngClass]="getActionColor(log.action)">
                          {{ getActionLabel(log.action) }}
                        </span>
                        <span class="text-[10px] font-medium text-slate-400 italic">
                          {{ log.timestamp | date:'dd MMM yyyy HH:mm' }}
                        </span>
                      </div>

                      <div class="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/50">
                        <div class="flex items-center justify-between mb-3">
                          <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">{{ log.typeCongeNom }}</span>
                          <div class="flex items-center gap-2">
                            <span class="text-xs font-bold text-slate-400 line-through">{{ log.ancienSolde || 0 }}</span>
                            <lucide-icon name="chevron-right" size="12" class="text-slate-300"></lucide-icon>
                            <span class="text-xs font-black text-indigo-600">{{ log.nouveauSolde }}</span>
                          </div>
                        </div>

                        @if (log.motif) {
                          <p class="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900/50 p-3 rounded-xl border border-slate-50 dark:border-slate-800 shadow-sm italic">
                            "{{ log.motif }}"
                          </p>
                        }

                        <div class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Par: {{ log.performBy }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Footer -->
          <div class="p-8 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 text-center">
             <p class="text-[10px] font-medium text-slate-400 uppercase tracking-widest">Fin de l'historique d'audit</p>
          </div>
        </div>
      </div>
    }
  `
})
export class RhSoldesManagerComponent implements OnInit {
  private soldeService = inject(RhSoldeService);
  private searchSubject = new Subject<string>();

  // State Signals
  activeTab = signal<'all' | 'uninitialized' | 'initialized'>('all');
  selectedYear = signal<number>(new Date().getFullYear());
  searchQuery = signal<string>('');
  currentPage = signal<number>(0);
  totalPages = signal<number>(1);
  pageSize = signal<number>(10);
  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  status = signal<{ type: 'success' | 'error', message: string } | null>(null);

  allEmployees = signal<EmployeeSolde[]>([]);
  employees = computed(() => {
    const list = this.allEmployees();
    const tab = this.activeTab();
    if (tab === 'uninitialized') return list.filter((e: EmployeeSolde) => !e.isInitialised);
    if (tab === 'initialized') return list.filter((e: EmployeeSolde) => e.isInitialised);
    return list;
  });

  leaveTypes = signal<any[]>([]);
  selectedEmployeeIds = signal<Set<number>>(new Set());
  
  editing = signal<{user: any, solde: any} | null>(null);
  newJours = signal<number>(0);
  motif = signal<string>('');
  showResetModal = signal<boolean>(false);
  
  // Audit Signals
  showAuditModal = signal<boolean>(false);
  auditLogs = signal<any[]>([]);
  selectedAuditUser = signal<any>(null);

  years = [2024, 2025, 2026, 2027];
  tabs = [
    { id: 'all', label: 'Tous' },
    { id: 'uninitialized', label: 'Non initialisés' },
    { id: 'initialized', label: 'Initialisés' }
  ] as const;

  constructor() {
    // Listen to tab or year changes to reload
    effect(() => {
      this.loadSoldes();
    });

    // Handle debounced search
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged()
    ).subscribe(() => {
      this.currentPage.set(0);
      this.loadSoldes();
    });
  }

  ngOnInit() {
    this.loadLeaveTypes();
  }

  loadLeaveTypes() {
    this.soldeService.getLeaveTypes().subscribe({
      next: (res: any[]) => this.leaveTypes.set(res)
    });
  }

  loadSoldes() {
    this.loading.set(true);
    
    this.soldeService.getGlobalSoldes({
      page: this.currentPage(),
      size: this.pageSize(),
      annee: this.selectedYear(),
      query: this.searchQuery()
    }).subscribe({
      next: (res: any) => {
        this.allEmployees.set(res.content || []);
        this.totalPages.set(res.totalPages || 1);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSearchChange(val: string) {
    this.searchQuery.set(val);
    this.searchSubject.next(val);
  }

  changePage(page: number) {
    this.currentPage.set(page);
    this.loadSoldes();
  }

  getProgressColor(restants: number, max: number): string {
    const percent = (restants / max) * 100;
    if (percent > 50) return 'bg-emerald-500';
    if (percent >= 20) return 'bg-amber-500';
    return 'bg-rose-500';
  }

  getSolde(soldes: SoldeDetail[], typeId: number): SoldeDetail | undefined {
    return soldes.find(s => s.typeCongeId === typeId);
  }

  // Selection Logic
  toggleSelection(id: number) {
    const set = new Set(this.selectedEmployeeIds());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.selectedEmployeeIds.set(set);
  }

  toggleAll(event: any) {
    if (event.target.checked) {
      this.selectedEmployeeIds.set(new Set(this.employees().map((e: EmployeeSolde) => e.utilisateurId)));
    } else {
      this.selectedEmployeeIds.set(new Set());
    }
  }

  isAllSelected(): boolean {
    return this.employees().length > 0 && this.selectedEmployeeIds().size === this.employees().length;
  }

  // Actions
  initialiserNouveaux() {
    this.loading.set(true);
    this.soldeService.initialiser([]).subscribe({
      next: () => {
        this.showStatus('success', 'Initialisation terminée !');
        this.loadSoldes();
      },
      error: () => this.showStatus('error', 'Erreur lors de l\'initialisation.')
    });
  }

  initialiserSelection() {
    const ids = Array.from(this.selectedEmployeeIds());
    this.loading.set(true);
    this.soldeService.initialiser(ids).subscribe({
      next: () => {
        this.showStatus('success', `${ids.length} collaborateurs initialisés !`);
        this.selectedEmployeeIds.set(new Set());
        this.loadSoldes();
      },
      error: () => this.showStatus('error', 'Erreur lors de l\'initialisation groupée.')
    });
  }

  openResetModal() {
    this.showResetModal.set(true);
  }

  closeResetModal() {
    this.showResetModal.set(false);
  }

  confirmAnnualReset() {
    this.closeResetModal();
    this.loading.set(true);
    this.soldeService.reinitialiserAnnuel(this.selectedYear(), []).subscribe({
      next: () => {
        this.showStatus('success', `Réinitialisation annuelle terminée pour ${this.selectedYear()}`);
        this.loadSoldes();
      },
      error: () => this.showStatus('error', 'Erreur lors de la réinitialisation.')
    });
  }

  openEditModal(user: any, solde: any) {
    this.editing.set({ user, solde });
    this.newJours.set(solde.joursRestants);
    this.motif.set('');
  }

  closeEditModal() {
    this.editing.set(null);
  }

  saveAdjustment() {
    const edit = this.editing();
    if (!edit) return;

    this.saving.set(true);
    this.soldeService.ajusterSolde(edit.user.utilisateurId, edit.solde.typeCongeId, {
      joursRestants: this.newJours(),
      motif: this.motif()
    }).subscribe({
      next: () => {
        this.showStatus('success', 'Solde ajusté avec succès.');
        this.closeEditModal();
        this.loadSoldes();
        this.saving.set(false);
      },
      error: () => {
        this.showStatus('error', 'Erreur lors de l\'ajustement.');
        this.saving.set(false);
      }
    });
  }

  loadHistory(emp: any) {
    this.selectedAuditUser.set(emp);
    this.loading.set(true);
    this.soldeService.getAuditLogs(emp.utilisateurId).subscribe({
      next: (res: any[]) => {
        this.auditLogs.set(res);
        this.showAuditModal.set(true);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showStatus('error', 'Impossible de charger l\'historique.');
      }
    });
  }

  closeAuditModal() {
    this.showAuditModal.set(false);
    this.selectedAuditUser.set(null);
    this.auditLogs.set([]);
  }

  getActionLabel(action: string): string {
    switch (action) {
      case 'MANUAL_ADJUSTMENT': return 'Ajustement Manuel';
      case 'ANNUAL_RESET': return 'Reset Annuel';
      case 'INITIALIZATION': return 'Initialisation';
      default: return action;
    }
  }

  getActionColor(action: string): string {
    switch (action) {
      case 'MANUAL_ADJUSTMENT': return 'text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400';
      case 'ANNUAL_RESET': return 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400';
      case 'INITIALIZATION': return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400';
      default: return 'text-slate-600 bg-slate-50 dark:bg-slate-500/10 dark:text-slate-400';
    }
  }

  private showStatus(type: 'success' | 'error', message: string) {
    this.status.set({ type, message });
    setTimeout(() => this.status.set(null), 5000);
  }
}
