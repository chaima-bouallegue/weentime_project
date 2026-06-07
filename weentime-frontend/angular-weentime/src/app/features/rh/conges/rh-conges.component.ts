import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { CongeService } from '../../employee/conges/conge.service';
import { ToastService } from '../../../core/services/toast.service';
import { DemandeConge } from '../../employee/conges/models/conge.model';
import { finalize } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RhLeaveStore } from '../../../core/services/rh-leave.store';
import { AuthService } from '../../../core/services/auth.service';
import { EmployeeCongesComponent } from '../../employee/conges/employee-conges.component';

@Component({
  selector: 'app-rh-conges',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule, EmployeeCongesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="animate-fade-in">
      @if (isRh()) {
        <div class="flex border-b border-slate-100 dark:border-slate-800 mb-8">
          <button (click)="activeTab.set('mes-demandes')" class="px-6 py-3 font-bold text-sm transition-all border-b-2" [class.border-indigo-600]="activeTab() === 'mes-demandes'" [class.text-indigo-600]="activeTab() === 'mes-demandes'" [class.border-transparent]="activeTab() !== 'mes-demandes'" [class.text-slate-400]="activeTab() !== 'mes-demandes'">
            Mes demandes
          </button>
          <button (click)="activeTab.set('gestion')" class="px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2" [class.border-indigo-600]="activeTab() === 'gestion'" [class.text-indigo-600]="activeTab() === 'gestion'" [class.border-transparent]="activeTab() !== 'gestion'" [class.text-slate-400]="activeTab() !== 'gestion'">
            <span>Gestion</span>
            @if (pendingCount() > 0) {
              <span class="px-2 py-0.5 text-[10px] font-black bg-rose-500 text-white rounded-full">{{ pendingCount() }}</span>
            }
          </button>
        </div>
      }

      @if (activeTab() === 'mes-demandes') {
        <app-employee-conges></app-employee-conges>
      } @else {
        <!-- Actions bar -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <div class="search-box-wrapper flex-1 max-w-md">
            <lucide-icon name="search" size="18" class="text-slate-400"></lucide-icon>
            <input type="text" class="input pl-10" placeholder="Rechercher un collaborateur..." [(ngModel)]="searchQuery" (input)="onFilterChange()">
          </div>
          
          <div class="flex items-center gap-3">
            <select class="input py-2 px-4 min-w-[180px]" [(ngModel)]="statusFilter" (change)="onFilterChange()">
              <option value="ALL">Tous les statuts</option>
              <option value="EN_ATTENTE_RH">À valider RH</option>
              <option value="EN_ATTENTE_MANAGER">Attente Manager</option>
              <option value="APPROUVE">Finalisés</option>
              <option value="REFUSE">Refusés</option>
            </select>
            <button class="btn btn-secondary" (click)="refresh()">
              <lucide-icon name="refresh-cw" size="16" [class.animate-spin]="isLoading()"></lucide-icon>
            </button>
          </div>
        </div>

        <!-- Stats Summary -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
           <div class="card p-6 flex flex-col">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">En attente RH</span>
              <div class="flex items-baseline gap-2">
                 <span class="text-3xl font-black text-amber-500">{{ pendingCount() }}</span>
                 <span class="text-xs text-slate-400">demandes</span>
              </div>
           </div>
           <div class="card p-6 flex flex-col">
              <span class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Total Finalisés</span>
              <div class="flex items-baseline gap-2">
                 <span class="text-3xl font-black text-emerald-500">{{ approvedCount() }}</span>
                 <span class="text-xs text-slate-400">ce mois</span>
              </div>
           </div>
        </div>

        <!-- Main Content Table -->
        <div class="card overflow-hidden">
          @if (isLoading()) {
            <div class="flex flex-col items-center justify-center p-20 gap-4">
              <div class="w-10 h-10 border-4 border-slate-200 border-t-indigo-500 rounded-full animate-spin"></div>
              <span class="text-sm font-medium text-slate-500">Synchronisation des demandes...</span>
            </div>
          } @else if (filteredDemandes().length === 0) {
            <div class="flex flex-col items-center justify-center p-20 text-center">
              <div class="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4">
                <lucide-icon name="calendar-check" size="32"></lucide-icon>
              </div>
              <h3 class="text-lg font-bold text-slate-800">Aucune demande trouvée</h3>
              <p class="text-sm text-slate-500">Ajustez vos filtres pour voir plus de résultats.</p>
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-slate-50/50 border-bottom border-slate-100">
                    <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Collaborateur</th>
                    <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Période</th>
                    <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Durée</th>
                    <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Statut</th>
                    <th class="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-50">
                  @for (demande of filteredDemandes(); track demande.id) {
                    <tr class="hover:bg-slate-50/30 transition-colors">
                      <td class="px-6 py-4">
                        <div class="flex items-center gap-3">
                          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-sm" [style.background]="avatarColor(demande.userName)">
                            {{ getInitials(demande.userName) }}
                          </div>
                          <div class="flex flex-col">
                            <span class="text-sm font-bold text-slate-800">{{ demande.userName }}</span>
                            <span class="text-xs text-slate-400">{{ demande.userEmail }}</span>
                          </div>
                        </div>
                      </td>
                      <td class="px-6 py-4">
                        <span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border" [style.border-color]="getTypeColor(demande.typeCongeNom)" [style.color]="getTypeColor(demande.typeCongeNom)">
                          {{ demande.typeCongeNom }}
                        </span>
                      </td>
                      <td class="px-6 py-4">
                        <div class="flex flex-col">
                          <span class="text-sm font-bold text-slate-700">{{ demande.dateDebut | date:'dd MMM' }}</span>
                          <span class="text-[10px] text-slate-400">au {{ demande.dateFin | date:'dd MMM yyyy' }}</span>
                        </div>
                      </td>
                      <td class="px-6 py-4">
                        <span class="text-sm font-black text-slate-800">{{ demande.nombreJours }} j</span>
                      </td>
                      <td class="px-6 py-4">
                        <span class="badge" [class]="getStatusClass(demande.statut)">
                          {{ formatStatut(demande.statut) }}
                        </span>
                      </td>
                      <td class="px-6 py-4 text-right">
                        @if (demande.statut === 'EN_ATTENTE_RH') {
                          <div class="flex justify-end gap-2">
                            <button class="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center" (click)="approve(demande)" [disabled]="isProcessing(demande.id)">
                              <lucide-icon name="check" size="14"></lucide-icon>
                            </button>
                            <button class="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center" (click)="openRejectDialog(demande)" [disabled]="isProcessing(demande.id)">
                              <lucide-icon name="x" size="14"></lucide-icon>
                            </button>
                          </div>
                        } @else {
                          <lucide-icon name="check-circle" size="16" class="text-slate-300 ml-auto"></lucide-icon>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      }
    </div>

    <!-- Rejection Modal -->
    @if (showRejectModal()) {
      <div class="fixed inset-0 z-[2000] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="closeRejectModal()"></div>
        <div class="card w-full max-w-md relative z-10 animate-scale-in">
          <div class="p-6 border-b flex justify-between items-center">
            <h3 class="text-lg font-black text-slate-800">Refuser la demande</h3>
            <button (click)="closeRejectModal()" class="text-slate-400 hover:text-slate-600">
              <lucide-icon name="x" size="20"></lucide-icon>
            </button>
          </div>
          <div class="p-6">
            <p class="text-sm text-slate-500 mb-4">Justification obligatoire pour le collaborateur :</p>
            <textarea class="input min-h-[120px]" placeholder="Motif du refus..." [(ngModel)]="rejectComment"></textarea>
          </div>
          <div class="p-6 bg-slate-50/50 flex justify-end gap-3 rounded-b-[var(--radius-lg)]">
            <button class="btn btn-secondary" (click)="closeRejectModal()">Annuler</button>
            <button class="btn btn-danger" [disabled]="!rejectComment.trim()" (click)="confirmReject()">Confirmer le refus</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .search-box-wrapper { position: relative; }
    .search-box-wrapper lucide-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); pointer-events: none; }
  `]
})
export class RhCongesComponent {
  private leaveStore = inject(RhLeaveStore);
  private congeService = inject(CongeService);
  private toast = inject(ToastService);
  private authService = inject(AuthService);

  isRh = computed(() => this.authService.hasRole('RH'));
  activeTab = signal<'mes-demandes' | 'gestion'>('gestion');

  isLoading = this.leaveStore.isLoading;
  allDemandes = this.leaveStore.allDemandes;
  
  searchQuery = signal('');
  statusFilter = signal('ALL');
  processingIds = signal<number[]>([]);

  showRejectModal = signal(false);
  selectedDemande = signal<DemandeConge | null>(null);
  rejectComment = '';

  filteredDemandes = computed(() => {
    let list = this.allDemandes();
    const query = this.searchQuery().toLowerCase();
    const status = this.statusFilter();

    if (status !== 'ALL') {
      list = list.filter(d => d.statut === status);
    }
    if (query) {
      list = list.filter(d => 
        d.userName?.toLowerCase().includes(query) || 
        d.userEmail?.toLowerCase().includes(query)
      );
    }
    return list;
  });

  pendingCount = computed(() => this.allDemandes().filter(d => d.statut === 'EN_ATTENTE_RH').length);
  approvedCount = computed(() => this.allDemandes().filter(d => d.statut === 'APPROUVE').length);

  refresh(): void {
    this.leaveStore.loadAllDemandes().subscribe({
      error: (error) => this.toast.error(this.extractErrorMessage(error, 'Chargement des demandes impossible'))
    });
  }

  onFilterChange(): void {
    // Computed signals handle filtering automatically
  }

  approve(demande: DemandeConge): void {
    this.startProcessing(demande.id);
    this.congeService.validerParRH(demande.id).pipe(
      finalize(() => this.stopProcessing(demande.id))
    ).subscribe({
      next: (updated) => {
        this.toast.success(`Demande de ${demande.userName} approuvée officiellement`);
        this.leaveStore.updateDemande(updated);
      },
      error: (error) => this.toast.error(this.extractErrorMessage(error, 'Echec de la validation RH'))
    });
  }

  openRejectDialog(demande: DemandeConge): void {
    this.selectedDemande.set(demande);
    this.rejectComment = '';
    this.showRejectModal.set(true);
  }

  closeRejectModal(): void {
    this.showRejectModal.set(false);
    this.selectedDemande.set(null);
  }

  confirmReject(): void {
    const d = this.selectedDemande();
    if (!d) return;

    this.startProcessing(d.id);
    this.congeService.rejeterDemande(d.id, this.rejectComment).pipe(
      finalize(() => {
        this.stopProcessing(d.id);
        this.closeRejectModal();
      })
    ).subscribe({
      next: (updated) => {
        this.toast.success('Demande rejetée par les RH');
        this.leaveStore.updateDemande(updated);
      },
      error: (error) => this.toast.error(this.extractErrorMessage(error, 'Erreur lors du rejet'))
    });
  }

  isProcessing(id: number): boolean {
    return this.processingIds().includes(id);
  }

  private startProcessing(id: number): void {
    this.processingIds.update(ids => [...ids, id]);
  }

  private stopProcessing(id: number): void {
    this.processingIds.update(ids => ids.filter(i => i !== id));
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getStatusClass(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER': return 'badge-warning';
      case 'EN_ATTENTE_RH': return 'badge-primary';
      case 'APPROUVE': return 'badge-success';
      case 'REFUSE': return 'badge-danger';
      default: return '';
    }
  }

  getTypeColor(type?: string): string {
    if (!type) return '#cbd5e1';
    const t = type.toLowerCase();
    if (t.includes('annuel')) return '#6366f1';
    if (t.includes('maladie')) return '#ef4444';
    if (t.includes('rtt')) return '#10b981';
    return '#f59e0b';
  }

  formatStatut(statut: string): string {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER': return 'Attente Manager';
      case 'EN_ATTENTE_RH': return 'À valider RH';
      case 'APPROUVE': return 'Finalisé';
      case 'REFUSE': return 'Refusé';
      default: return statut;
    }
  }

  avatarColor(name?: string): string {
    if (!name) return '#6366f1';
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const source = (error ?? {}) as Record<string, any>;
    return source?.['error']?.['message'] || source?.['message'] || fallback;
  }
}
