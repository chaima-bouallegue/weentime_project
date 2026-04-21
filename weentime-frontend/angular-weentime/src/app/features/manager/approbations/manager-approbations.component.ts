import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule, AlertTriangle, BadgeCheck, Inbox, RefreshCw, Search, Shield, X, XCircle, Clock3 } from 'lucide-angular';
import { ApprobationService, Demande } from './approbation.service';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';

type StatusGroup = 'PENDING' | 'FORWARDED' | 'APPROVED' | 'REJECTED' | 'ALL';
type DecisionAction = 'approve' | 'reject';

@Component({
  selector: 'app-manager-approbations',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './manager-approbations.component.html',
  styleUrl: './manager-approbations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerApprobationsComponent {
  private readonly approbationService = inject(ApprobationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assistantSync = inject(AssistantSyncService);

  protected readonly iconRefresh = RefreshCw;
  protected readonly iconInbox = Inbox;
  protected readonly iconShield = Shield;
  protected readonly iconBadgeCheck = BadgeCheck;
  protected readonly iconXCircle = XCircle;
  protected readonly iconSearch = Search;
  protected readonly iconAlert = AlertTriangle;
  protected readonly iconClock = Clock3;
  protected readonly iconX = X;

  protected readonly statusTabs = [
    { label: 'En attente', value: 'PENDING' },
    { label: 'Transmis RH', value: 'FORWARDED' },
    { label: 'Approuves', value: 'APPROVED' },
    { label: 'Refuses', value: 'REJECTED' },
    { label: 'Tous', value: 'ALL' }
  ] as const;

  protected readonly statusGroup = signal<StatusGroup>('PENDING');
  protected readonly employeeFilter = signal('');
  protected readonly typeFilter = signal('');
  protected readonly selectedDemande = signal<Demande | null>(null);
  protected readonly selectedAction = signal<DecisionAction | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected decisionComment = '';

  protected readonly isLoading = this.approbationService.loadingSignal.asReadonly();
  private readonly pending = this.approbationService.pendingApprobationsSignal;
  private readonly forwarded = this.approbationService.forwardedDemandesSignal;
  private readonly approved = this.approbationService.approbedDemandesSignal;
  private readonly rejected = this.approbationService.rejectedDemandesSignal;

  protected readonly allRequests = computed(() => [
    ...this.pending(),
    ...this.forwarded(),
    ...this.approved(),
    ...this.rejected()
  ].sort((left, right) => new Date(right.dateCreation).getTime() - new Date(left.dateCreation).getTime()));

  protected readonly requestTypes = computed(() =>
    Array.from(new Set(this.allRequests().map(item => item.type))).sort()
  );

  protected readonly filteredRequests = computed(() => {
    const employee = this.employeeFilter().trim().toLowerCase();
    const type = this.typeFilter();

    return this.filteredByStatus().filter(item => {
      const fullName = item.utilisateur?.fullName ?? `${item.utilisateur?.prenom ?? ''} ${item.utilisateur?.nom ?? ''}`.trim();
      const email = item.utilisateur?.email ?? '';
      const matchesEmployee = !employee || `${fullName} ${email}`.toLowerCase().includes(employee);
      const matchesType = !type || item.type === type;
      return matchesEmployee && matchesType;
    });
  });

  constructor() {
    this.load();
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        const tool = event.actionResult?.tool;
        if (tool === 'approve_request' || tool === 'reject_request') {
          this.load();
        }
      });
  }

  protected load(): void {
    this.errorMessage.set(null);
    this.approbationService.refreshBuckets();
  }

  protected pendingCount(): number {
    return this.pending().length;
  }

  protected forwardedCount(): number {
    return this.forwarded().length;
  }

  protected approvedCount(): number {
    return this.approved().length;
  }

  protected rejectedCount(): number {
    return this.rejected().length;
  }

  protected statusMeta(status: Demande['statut']): { label: string; tone: string } {
    switch (status) {
      case 'APPROUVEE':
        return { label: 'Approuvee', tone: 'success' };
      case 'REFUSEE':
        return { label: 'Refusee', tone: 'danger' };
      case 'EN_ATTENTE_RH':
        return { label: 'Transmis RH', tone: 'info' };
      default:
        return { label: 'En attente', tone: 'warning' };
    }
  }

  protected getInitials(name?: string): string {
    if (!name) {
      return 'WT';
    }
    return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() ?? '').join('') || 'WT';
  }

  protected requestTypeLabel(demande: Demande): string {
    return this.approbationService.getTypeLabel(demande.type);
  }

  protected requestTypeOptionLabel(type: string): string {
    return this.approbationService.getTypeLabel(type);
  }

  protected requestUserName(demande: Demande | null): string {
    if (!demande) {
      return '';
    }
    const fullName = demande.utilisateur?.fullName
      ?? `${demande.utilisateur?.prenom ?? ''} ${demande.utilisateur?.nom ?? ''}`.trim();
    return fullName || 'Employe';
  }

  protected requestUserEmail(demande: Demande | null): string {
    return demande?.utilisateur?.email ?? '';
  }

  protected requestComment(demande: Demande): string {
    return demande.raison || demande.description || 'Sans commentaire';
  }

  protected selectedRequestTypeLabel(): string {
    const demande = this.selectedDemande();
    return demande ? this.requestTypeLabel(demande) : '';
  }

  protected isStale(dateValue: string): boolean {
    const ageInHours = (Date.now() - new Date(dateValue).getTime()) / 36e5;
    return ageInHours >= 24;
  }

  protected ageLabel(dateValue: string): string {
    const minutes = Math.max(Math.floor((Date.now() - new Date(dateValue).getTime()) / 60000), 0);
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} h`;
    }
    return `${Math.floor(hours / 24)} j`;
  }

  protected openDecision(demande: Demande, action: DecisionAction): void {
    this.selectedDemande.set(demande);
    this.selectedAction.set(action);
    this.decisionComment = '';
  }

  protected closeDecision(): void {
    this.selectedDemande.set(null);
    this.selectedAction.set(null);
    this.decisionComment = '';
  }

  protected confirmDecision(): void {
    const demande = this.selectedDemande();
    const action = this.selectedAction();
    if (!demande || !action) {
      return;
    }

    this.submitting.set(true);
    const request$ = action === 'approve'
      ? this.approbationService.approveDemande(demande.type, demande.id, this.decisionComment)
      : this.approbationService.rejectDemande(demande.type, demande.id, this.decisionComment);

    request$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.closeDecision();
          this.load();
        },
        error: () => {
          this.errorMessage.set('La mise a jour de la demande a echoue.');
          this.submitting.set(false);
        }
      });
  }

  private filteredByStatus(): Demande[] {
    switch (this.statusGroup()) {
      case 'APPROVED':
        return this.allRequests().filter(item => item.statut === 'APPROUVEE');
      case 'REJECTED':
        return this.allRequests().filter(item => item.statut === 'REFUSEE');
      case 'FORWARDED':
        return this.allRequests().filter(item => item.statut === 'EN_ATTENTE_RH');
      case 'ALL':
        return this.allRequests();
      default:
        return this.allRequests().filter(item => item.statut === 'EN_ATTENTE_MANAGER');
    }
  }
}
