import { Component, Input, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { DemandeTeletravailWorkflow, StatutTeletravail } from '../../../../shared/models/workflow-teletravail.model';
import { DateFrPipe } from '../../../../../shared/pipes/date-fr.pipe';

type SortColumn = 'employe' | 'type' | 'dateDebut' | 'nombreJours' | 'departement' | 'statut';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-historique-global',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, DateFrPipe],
  templateUrl: './historique-global.component.html',
  styleUrl: './historique-global.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoriqueGlobalComponent {
  private _demandes = signal<DemandeTeletravailWorkflow[]>([]);
  
  @Input() set demandes(value: DemandeTeletravailWorkflow[]) {
    this._demandes.set(Array.isArray(value) ? value : []);
  }
  
  @Input() isLoading = false;

  searchQuery = signal('');
  filtreStatut = signal<StatutTeletravail | 'TOUS'>('TOUS');
  sortColumn = signal<SortColumn>('dateDebut');
  sortDirection = signal<SortDirection>('desc');
  currentPage = signal(1);
  pageSize = 10;

  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  filteredDemandes = computed(() => {
    let result = [...this._demandes()];
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      result = result.filter(d =>
        `${d.employe.prenom} ${d.employe.nom}`.toLowerCase().includes(query) ||
        d.employe.departement.toLowerCase().includes(query)
      );
    }
    const statut = this.filtreStatut();
    if (statut !== 'TOUS') {
      result = result.filter(d => d.statut === statut);
    }
    const col = this.sortColumn();
    const dir = this.sortDirection();
    result.sort((a, b) => {
      let cmp = 0;
      switch (col) {
        case 'employe': cmp = `${a.employe.nom}`.localeCompare(`${b.employe.nom}`); break;
        case 'type': cmp = a.label.localeCompare(b.label); break;
        case 'dateDebut': cmp = a.dateDebut.localeCompare(b.dateDebut); break;
        case 'nombreJours': cmp = a.nombreJours - b.nombreJours; break;
        case 'departement': cmp = a.employe.departement.localeCompare(b.employe.departement); break;
        case 'statut': cmp = a.statut.localeCompare(b.statut); break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return result;
  });

  paginatedDemandes = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredDemandes().slice(start, start + this.pageSize);
  });

  totalPages = computed(() => Math.ceil(this.filteredDemandes().length / this.pageSize));

  onSearchInput(value: string): void {
    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      this.searchQuery.set(value);
      this.currentPage.set(1);
    }, 300);
  }

  onSort(col: SortColumn): void {
    if (this.sortColumn() === col) {
      this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(col);
      this.sortDirection.set('asc');
    }
  }

  getStatusConfig(statut: StatutTeletravail): { label: string; color: string } {
    switch (statut) {
      case 'EN_ATTENTE_MANAGER': return { label: 'Att. Manager', color: 'badge-warning' };
      case 'EN_ATTENTE_RH': return { label: 'Att. RH', color: 'badge-info' };
      case 'APPROUVE': return { label: 'Approuve', color: 'badge-success' };
      case 'REFUSE': return { label: 'Refuse', color: 'badge-danger' };
      case 'ANNULE': return { label: 'Annule', color: 'badge-gray' };
      default: return { label: 'Inconnu', color: 'badge-gray' };
    }
  }

  getAvatarColor(initiales: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];
    let hash = 0;
    for (let i = 0; i < initiales.length; i++) hash = initiales.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  exportCSV(): void {
    const header = 'Employé,Département,Type,Date début,Date fin,Jours,Statut,Manager,RH\n';
    const rows = this.filteredDemandes().map(d =>
      `"${d.employe.prenom} ${d.employe.nom}","${d.employe.departement}","${d.label}","${d.dateDebut}","${d.dateFin}",${d.nombreJours},"${d.statut}","${d.commentaireManager ?? ''}","${d.commentaireRH ?? ''}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historique-teletravail-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
}
