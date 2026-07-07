import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, Eye } from 'lucide-angular';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CongeService } from '../../employee/conges/conge.service';
import { ToastService } from '../../../core/services/toast.service';
import { DemandeConge, StatutDemande } from '../../employee/conges/models/conge.model';
import { finalize } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { RhLeaveStore } from '../../../core/services/rh-leave.store';
import { AuthService } from '../../../core/services/auth.service';
import { EmployeeCongesComponent } from '../../employee/conges/employee-conges.component';
import { CongeDetailPanelComponent } from './components/conge-detail-panel/conge-detail-panel.component';
import { CongeDecisionRhModalComponent } from './components/conge-decision-rh-modal/conge-decision-rh-modal.component';

@Component({
  selector: 'app-rh-conges',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    LucideAngularModule,
    MatTooltipModule,
    FormsModule,
    EmployeeCongesComponent,
    CongeDetailPanelComponent,
    CongeDecisionRhModalComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rh-conges.component.html',
  styleUrl: './rh-conges.component.scss'
})
export class RhCongesComponent {
  readonly iconEye = Eye;
  private readonly leaveStore = inject(RhLeaveStore);
  private readonly congeService = inject(CongeService);
  private readonly toast = inject(ToastService);
  private readonly authService = inject(AuthService);

  readonly isRh = computed(() => this.authService.hasRole('RH'));
  readonly activeTab = signal<'mes-demandes' | 'gestion'>('gestion');

  readonly isLoading = this.leaveStore.isLoading;
  readonly allDemandes = this.leaveStore.allDemandes;

  readonly searchQuery = signal('');
  readonly statusFilter = signal('ALL');

  readonly demandeSelectionnee = signal<DemandeConge | null>(null);
  readonly showDetailPanel = signal(false);
  readonly modeDecision = signal<'VALIDER' | 'REFUSER' | null>(null);
  readonly isSubmittingDecision = signal(false);

  readonly filteredDemandes = computed(() => {
    let list = this.allDemandes();
    const query = this.searchQuery().toLowerCase().trim();
    const status = this.statusFilter();

    if (status !== 'ALL') {
      list = list.filter(d => this.matchesStatusFilter(d.statut, status));
    }
    if (query) {
      list = list.filter(d =>
        d.userName?.toLowerCase().includes(query) ||
        d.userEmail?.toLowerCase().includes(query)
      );
    }
    return list;
  });

  readonly pendingCount = computed(() =>
    this.allDemandes().filter(d => d.statut === 'EN_ATTENTE_RH').length
  );

  readonly managerPendingCount = computed(() =>
    this.allDemandes().filter(d => d.statut === 'EN_ATTENTE_MANAGER').length
  );

  readonly totalCount = computed(() => this.allDemandes().length);

  readonly approvedThisMonth = computed(() => {
    const now = new Date();
    return this.allDemandes().filter(d => {
      if (!this.isApprovedStatus(d.statut)) return false;
      const created = new Date(d.dateCreation);
      if (Number.isNaN(created.getTime())) return false;
      return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
    }).length;
  });

  readonly dashboardLink = computed(() => {
    const role = (this.authService.currentUser()?.roles?.[0] ?? 'RH').toUpperCase();
    const base =
      role === 'ADMIN' ? 'admin' :
      role === 'MANAGER' ? 'manager' :
      role === 'RH' ? 'rh' : 'employee';
    return `/app/${base}/dashboard`;
  });

  refresh(): void {
    this.leaveStore.loadAllDemandes().subscribe({
      error: (error) => this.toast.error(this.extractErrorMessage(error, 'Chargement des demandes impossible'))
    });
  }

  onApprouver(demande: DemandeConge): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('VALIDER');
  }

  onRefuser(demande: DemandeConge): void {
    this.demandeSelectionnee.set(demande);
    this.modeDecision.set('REFUSER');
  }

  closeDecisionModal(): void {
    this.modeDecision.set(null);
    if (!this.showDetailPanel()) {
      this.demandeSelectionnee.set(null);
    }
  }

  openDetail(demande: DemandeConge): void {
    this.demandeSelectionnee.set(demande);
    this.showDetailPanel.set(true);
  }

  closeDetailPanel(): void {
    this.showDetailPanel.set(false);
    if (!this.modeDecision()) {
      this.demandeSelectionnee.set(null);
    }
  }

  onConfirmDecision(event: { id: number; commentaire: string }): void {
    const mode = this.modeDecision();
    if (!mode) return;

    this.isSubmittingDecision.set(true);
    const request$ = mode === 'VALIDER'
      ? this.congeService.validerParRH(event.id)
      : this.congeService.rejeterDemande(event.id, event.commentaire);

    request$.pipe(
      finalize(() => this.isSubmittingDecision.set(false))
    ).subscribe({
      next: (updated) => {
        const name = this.demandeSelectionnee()?.userName ?? 'Collaborateur';
        this.toast.success(
          mode === 'VALIDER' ? `Demande de ${name} approuvée` : 'Demande refusée'
        );
        this.leaveStore.updateDemande(updated);
        this.modeDecision.set(null);
        this.showDetailPanel.set(false);
        this.demandeSelectionnee.set(null);
      },
      error: (error) => {
        this.toast.error(
          this.extractErrorMessage(
            error,
            mode === 'VALIDER' ? 'Échec de la validation RH' : 'Erreur lors du rejet'
          )
        );
      }
    });
  }

  canRhAct(statut: StatutDemande | string): boolean {
    return statut === 'EN_ATTENTE_RH' || statut === 'EN_ATTENTE';
  }

  isManagerPending(statut: StatutDemande | string): boolean {
    return statut === 'EN_ATTENTE_MANAGER';
  }

  canViewDetail(statut: StatutDemande | string): boolean {
    return this.isApprovedStatus(statut) || statut === 'REFUSE' || statut === 'REFUSEE';
  }

  getInitials(name?: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  }

  getStatusBadgeClass(statut: StatutDemande | string): string {
    switch (statut) {
      case 'EN_ATTENTE_RH':
      case 'EN_ATTENTE':
        return 'badge--pending';
      case 'EN_ATTENTE_MANAGER':
        return 'badge--manager';
      case 'APPROUVE':
      case 'APPROUVEE':
      case 'PRET':
        return 'badge--approved';
      case 'REFUSE':
      case 'REFUSEE':
        return 'badge--rejected';
      default:
        return 'badge--neutral';
    }
  }

  getTypeColor(type?: string): string {
    if (!type) return '#9ca3af';
    const t = type.toLowerCase();
    if (t.includes('annuel')) return '#3b6feb';
    if (t.includes('maladie')) return '#dc2626';
    if (t.includes('rtt')) return '#059669';
    return '#d97706';
  }

  formatStatut(statut: StatutDemande | string): string {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER':
        return 'Attente manager';
      case 'EN_ATTENTE':
      case 'EN_ATTENTE_RH':
        return 'En attente';
      case 'APPROUVE':
      case 'APPROUVEE':
      case 'PRET':
        return 'Approuvé';
      case 'REFUSE':
      case 'REFUSEE':
        return 'Refusé';
      case 'ANNULE':
      case 'ANNULEE':
        return 'Annulé';
      default:
        return String(statut).replace(/_/g, ' ').toLowerCase();
    }
  }

  avatarColor(name?: string): string {
    if (!name) return '#3b6feb';
    const colors = ['#3b6feb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#dc2626'];
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

  private matchesStatusFilter(statut: StatutDemande | string, filter: string): boolean {
    if (filter === 'APPROUVE') {
      return this.isApprovedStatus(statut);
    }
    return statut === filter;
  }

  private isApprovedStatus(statut: StatutDemande | string): boolean {
    return statut === 'APPROUVE' || statut === 'APPROUVEE' || statut === 'PRET';
  }
}
