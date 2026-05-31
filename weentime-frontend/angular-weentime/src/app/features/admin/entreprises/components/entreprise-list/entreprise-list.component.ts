import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, Copy, Building } from 'lucide-angular';
import { Entreprise } from '../../entreprise.service';

export type StatutEntreprise = 'ACTIVE' | 'SUSPENDED' | 'CLOSED';

@Component({
  selector: 'app-entreprise-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './entreprise-list.component.html',
  styleUrls: ['./entreprise-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrepriseListComponent {
  @Input() entreprises: Entreprise[] = [];
  @Input() loading = false;
  @Input() selectedId: string | null = null;  // ← string, pas number

  @Output() search = new EventEmitter<string>();
  @Output() filter = new EventEmitter<'ALL' | StatutEntreprise>();
  @Output() select = new EventEmitter<string>();  // ← string
  @Output() edit = new EventEmitter<Entreprise>();
  @Output() delete = new EventEmitter<Entreprise>();

  searchTerm = '';
  activeFilter: 'ALL' | StatutEntreprise = 'ALL';

  // ✅ Constantes utilisables dans le template
  readonly ACTIVE = 'ACTIVE' as const;
  readonly SUSPENDED = 'SUSPENDED' as const;
  readonly CLOSED = 'CLOSED' as const;

  readonly iconSearch = Search;
  readonly iconCopy = Copy;
  readonly iconBuilding = Building;

  onSearchChange(term: string): void {
    this.search.emit(term);
  }

  setFilter(filter: 'ALL' | StatutEntreprise): void {
    this.activeFilter = filter;
    this.filter.emit(filter);
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      ACTIVE: 'Active',
      SUSPENDED: 'Suspendue',
      CLOSED: 'Fermée',
    };
    return labels[status] ?? status;
  }

  copyCode(event: Event, code: string): void {
    event.stopPropagation();
    if (code) navigator.clipboard.writeText(code);
  }
}