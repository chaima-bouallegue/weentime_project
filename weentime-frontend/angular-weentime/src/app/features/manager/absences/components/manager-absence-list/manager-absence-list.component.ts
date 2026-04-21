import { Component, inject, computed, output, ChangeDetectionStrategy, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AbsenceService } from '../../../../rh/absences/absence.service';
import { AbsenceResponse, STATUT_CONFIG, AbsenceStatut, ABSENCE_TYPES } from '../../../../rh/absences/absence.models';

@Component({
  selector: 'app-manager-absence-list',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './manager-absence-list.component.html',
  styleUrls: ['./manager-absence-list.component.scss']
})
export class ManagerAbsenceListComponent implements OnInit {
  private absenceService = inject(AbsenceService);
  private cdr            = inject(ChangeDetectorRef);

  addNew = output<void>();

  // Mock: Manager's team members
  readonly teamMembers = [
    { id: 1, prenom: 'Imed', nom: 'Ghada', initials: 'IG', color: '#6366f1', poste: 'Dev Fullstack' },
    { id: 2, prenom: 'Sara', nom: 'Mimouni', initials: 'SM', color: '#ec4899', poste: 'UI Designer' },
    { id: 3, prenom: 'Fares', nom: 'Yassin', initials: 'FY', color: '#f59e0b', poste: 'Growth Manager' },
    { id: 6, prenom: 'Nour', nom: 'Ben Ali', initials: 'NB', color: '#06b6d4', poste: 'Sales Rep' }
  ];

  loading   = signal(true);
  absences  = signal<AbsenceResponse[]>([]);
  totalItems = signal(0);

  ngOnInit(): void {
    this.loadTeamAbsences();
  }

  loadTeamAbsences(): void {
    this.loading.set(true);
    this.absenceService.absencesEntreprise({ page: 0, size: 50 }).subscribe({
      next: data => {
        this.absences.set(data.content);
        this.totalItems.set(data.totalElements);
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  getEmployeeAbsenceCount(empId: number): number {
    return this.absences().filter(a => a.utilisateurId === empId).length;
  }

  isAbsent(empId: number): boolean {
    const today = new Date().toISOString().split('T')[0];
    return this.absences().some(a =>
      a.utilisateurId === empId && a.dateDebut <= today && a.dateFin >= today && a.statut === 'APPROUVE'
    );
  }

  formatDate(d: string): string {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(d));
  }

  getStatutConfig(statut: AbsenceStatut) {
    return STATUT_CONFIG[statut] ?? { label: statut, cssClass: 'badge-gray' };
  }

  getTypeEmoji(code: string): string {
    return ABSENCE_TYPES.find(t => t.code === code)?.emoji ?? '❓';
  }

  trackById(_: number, item: AbsenceResponse): number {
    return item.id;
  }
}
