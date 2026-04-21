import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Check, X, Search, Filter, CalendarCheck, Clock } from 'lucide-angular';
import { CongeService } from '../../employee/conges/conge.service';
import { ToastService } from '../../../core/services/toast.service';
import { DemandeConge } from '../../employee/conges/models/conge.model';
import { finalize } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-rh-conges',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rh-conges-container">
      <header class="page-header">
        <div class="header-content">
          <h1 class="page-title">Gestion des Congés</h1>
          <p class="page-subtitle">Validation finale et suivi global des absences</p>
        </div>
        
        <div class="stats-row">
          <div class="mini-stat">
            <span class="label">À valider</span>
            <span class="value yellow">{{ pendingCount() }}</span>
          </div>
          <div class="mini-stat">
            <span class="label">Approuvés</span>
            <span class="value green">{{ approvedCount() }}</span>
          </div>
        </div>
      </header>

      <div class="filters-bar card mb-6">
        <div class="search-box">
          <lucide-icon name="search" size="18"></lucide-icon>
          <input type="text" placeholder="Rechercher un collaborateur..." [(ngModel)]="searchQuery" (input)="filterDemandes()">
        </div>
        
        <div class="filter-actions">
          <select class="filter-select" [(ngModel)]="statusFilter" (change)="filterDemandes()">
            <option value="ALL">Tous les statuts</option>
            <option value="EN_ATTENTE_RH">En attente RH</option>
            <option value="EN_ATTENTE_MANAGER">En attente Manager</option>
            <option value="APPROUVE">Approuvés</option>
            <option value="REFUSE">Refusés</option>
          </select>
        </div>
      </div>

      <div class="content-section">
        <div class="table-container card">
          @if (isLoading()) {
            <div class="loading-state">
              <div class="spinner"></div>
              <span>Chargement des demandes...</span>
            </div>
          } @else if (filteredDemandes().length === 0) {
            <div class="empty-state">
              <div class="empty-icon"><lucide-icon name="calendar-check" size="48"></lucide-icon></div>
              <h3>Aucune demande trouvée</h3>
              <p>Essayez de modifier vos filtres.</p>
            </div>
          } @else {
            <table class="data-table">
              <thead>
                <tr>
                  <th>Collaborateur</th>
                  <th>Équipe</th>
                  <th>Type</th>
                  <th>Période</th>
                  <th>Jours</th>
                  <th>Statut</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (demande of filteredDemandes(); track demande.id) {
                  <tr>
                    <td>
                      <div class="user-info">
                        <div class="user-avatar">{{ getInitials(demande.userName) }}</div>
                        <div class="user-details">
                          <span class="user-name">{{ demande.userName }}</span>
                          <span class="user-email">{{ demande.userEmail }}</span>
                        </div>
                      </div>
                    </td>
                    <td><span class="team-name">{{ demande.managerName || 'N/A' }} (Manager)</span></td>
                    <td>
                      <span class="type-pill" [style.border-color]="getTypeColor(demande.typeCongeNom)">
                        {{ demande.typeCongeNom }}
                      </span>
                    </td>
                    <td>
                      <div class="period-cell">
                        <span class="dates">{{ demande.dateDebut | date:'dd/MM' }} - {{ demande.dateFin | date:'dd/MM/yy' }}</span>
                      </div>
                    </td>
                    <td><strong>{{ demande.nombreJours }} j</strong></td>
                    <td>
                      <span class="status-badge" [class]="demande.statut.toLowerCase()">
                        {{ formatStatut(demande.statut) }}
                      </span>
                    </td>
                    <td class="actions-col">
                      @if (demande.statut === 'EN_ATTENTE_RH') {
                        <div class="action-buttons">
                          <button class="btn-icon approve" (click)="approve(demande)" [disabled]="isProcessing(demande.id)" title="Approuver">
                            <lucide-icon name="check" size="18"></lucide-icon>
                          </button>
                          <button class="btn-icon reject" (click)="openRejectDialog(demande)" [disabled]="isProcessing(demande.id)" title="Refuser">
                            <lucide-icon name="x" size="18"></lucide-icon>
                          </button>
                        </div>
                      } @else if (demande.statut === 'APPROUVE') {
                        <span class="text-xs text-green-600 font-bold">Validé par RH</span>
                      } @else if (demande.statut === 'EN_ATTENTE_MANAGER') {
                        <span class="text-xs text-slate-400 italic">Attente Manager</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </div>
      </div>
    </div>

    <!-- Rejection Modal (shared UI pattern) -->
    @if (showRejectModal()) {
      <div class="modal-overlay">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Refuser la demande</h3>
            <button class="close-btn" (click)="closeRejectModal()"><lucide-icon name="x" size="20"></lucide-icon></button>
          </div>
          <div class="modal-body">
            <p class="text-sm text-slate-500 mb-4">Veuillez indiquer le motif du refus RH pour <strong>{{ selectedDemande()?.userName }}</strong>.</p>
            <textarea 
              class="form-control" 
              rows="4" 
              placeholder="Justification du refus..."
              [(ngModel)]="rejectComment"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="closeRejectModal()">Annuler</button>
            <button 
              class="btn btn-danger" 
              [disabled]="!rejectComment.trim() || isProcessing(selectedDemande()?.id || 0)"
              (click)="confirmReject()"
            >
              Confirmer le refus RH
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .rh-conges-container { padding: 32px; max-width: 1400px; margin: 0 auto; }
    
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
    .page-title { font-size: 28px; font-weight: 900; color: #1e293b; margin: 0; }
    .page-subtitle { color: #64748b; margin: 4px 0 0; }
    
    .stats-row { display: flex; gap: 24px; }
    .mini-stat { display: flex; flex-direction: column; align-items: flex-end; }
    .mini-stat .label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; }
    .mini-stat .value { font-size: 28px; font-weight: 900; line-height: 1; margin-top: 4px; }
    .mini-stat .value.yellow { color: #eab308; }
    .mini-stat .value.green { color: #10b981; }

    .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    :host-context(.dark) .card { background: #1e293b; border-color: #334155; }
    :host-context(.dark) .page-title { color: #f8fafc; }

    .filters-bar { padding: 12px 24px; display: flex; justify-content: space-between; align-items: center; gap: 20px; }
    .search-box { flex: 1; position: relative; display: flex; align-items: center; color: #94a3b8; }
    .search-box input { width: 100%; border: none; background: transparent; padding: 10px 12px; font-size: 14px; outline: none; color: #1e293b; }
    :host-context(.dark) .search-box input { color: #f8fafc; }
    
    .filter-select { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 8px 16px; font-size: 13px; font-weight: 600; outline: none; transition: border-color 0.2s; }
    :host-context(.dark) .filter-select { background: #0f172a; border-color: #334155; color: #f8fafc; }

    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th { padding: 16px 24px; background: #f8fafc; color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.025em; text-align: left; }
    :host-context(.dark) .data-table th { background: #0f172a; border-bottom-color: #334155; }
    .data-table td { padding: 16px 24px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    :host-context(.dark) .data-table td { border-bottom-color: #334155; }

    .user-info { display: flex; align-items: center; gap: 12px; }
    .user-avatar { width: 40px; height: 40px; border-radius: 12px; background: #6366f1; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
    .user-name { display: block; font-weight: 700; font-size: 14px; color: #1e293b; }
    :host-context(.dark) .user-name { color: #f8fafc; }
    .user-email { display: block; font-size: 12px; color: #94a3b8; }

    .team-name { font-size: 13px; color: #64748b; }

    .type-pill { padding: 4px 12px; border-radius: 10px; border: 1px solid; font-size: 11px; font-weight: 700; color: #64748b; background: rgba(0,0,0,0.02); }

    .status-badge { padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .status-badge.en_attente_rh { background: #dbeafe; color: #1e40af; }
    .status-badge.en_attente_manager { background: #fef9c3; color: #854d0e; }
    .status-badge.approuve { background: #dcfce7; color: #166534; }
    .status-badge.refuse { background: #fee2e2; color: #991b1b; }

    .actions-col { text-align: right; }
    .action-buttons { display: flex; gap: 8px; justify-content: flex-end; }
    .btn-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; transition: all 0.2s; }
    .btn-icon.approve { background: #dcfce7; color: #16a34a; }
    .btn-icon.approve:hover { background: #16a34a; color: #fff; }
    .btn-icon.reject { background: #fee2e2; color: #ef4444; }
    .btn-icon.reject:hover { background: #ef4444; color: #fff; }

    /* Modal styles (same as manager for consistency) */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-card { background: #fff; border-radius: 24px; width: 100%; max-width: 440px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
    .modal-header { padding: 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
    .modal-body { padding: 24px; }
    .form-control { width: 100%; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; outline: none; resize: none; font-size: 14px; }
    .modal-footer { padding: 16px 24px; background: #f8fafc; display: flex; gap: 12px; justify-content: flex-end; }
    
    .btn { padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 700; cursor: pointer; border: none; }
    .btn-outline { background: #fff; border: 1px solid #e2e8f0; color: #64748b; }
    .btn-danger { background: #ef4444; color: #fff; }

    .loading-state, .empty-state { padding: 80px; text-align: center; }
    .spinner { width: 32px; height: 32px; border: 3px solid #e2e8f0; border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class RhCongesComponent {
  private congeService = inject(CongeService);
  private toast = inject(ToastService);

  allDemandes = signal<DemandeConge[]>([]);
  filteredDemandes = signal<DemandeConge[]>([]);
  isLoading = signal(true);
  processingIds = signal<number[]>([]);

  searchQuery = '';
  statusFilter = 'ALL';

  showRejectModal = signal(false);
  selectedDemande = signal<DemandeConge | null>(null);
  rejectComment = '';

  pendingCount = signal(0);
  approvedCount = signal(0);

  constructor() {
    this.loadDemandes();
  }

  loadDemandes(): void {
    this.isLoading.set(true);
    this.congeService.getAllDemandes().pipe(
      finalize(() => this.isLoading.set(false))
    ).subscribe({
      next: (data) => {
        this.allDemandes.set(data);
        this.filterDemandes();
        this.updateStats(data);
      },
      error: () => this.toast.error('Erreur de chargement des demandes')
    });
  }

  updateStats(data: DemandeConge[]): void {
    this.pendingCount.set(data.filter(d => d.statut === 'EN_ATTENTE_RH').length);
    this.approvedCount.set(data.filter(d => d.statut === 'APPROUVE').length);
  }

  filterDemandes(): void {
    let filtered = this.allDemandes();

    if (this.statusFilter !== 'ALL') {
      filtered = filtered.filter(d => d.statut === this.statusFilter);
    }

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.userName?.toLowerCase().includes(query) || 
        d.userEmail?.toLowerCase().includes(query)
      );
    }

    this.filteredDemandes.set(filtered);
  }

  approve(demande: DemandeConge): void {
    this.startProcessing(demande.id);
    this.congeService.validerParRH(demande.id).pipe(
      finalize(() => this.stopProcessing(demande.id))
    ).subscribe({
      next: () => {
        this.toast.success(`Demande de ${demande.userName} approuvée officiellement`);
        this.loadDemandes();
      },
      error: () => this.toast.error('Échec de la validation RH')
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
      next: () => {
        this.toast.success('Demande rejetée par les RH');
        this.loadDemandes();
      },
      error: () => this.toast.error('Erreur lors du rejet')
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
      case 'EN_ATTENTE_RH': return 'Attente RH';
      case 'APPROUVE': return 'Finalisé';
      case 'REFUSE': return 'Refusé';
      default: return statut;
    }
  }
}
