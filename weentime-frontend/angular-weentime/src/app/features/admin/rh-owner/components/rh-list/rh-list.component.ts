import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Search, Mail, Building, Calendar, MoreVertical, ShieldOff, ShieldCheck, UserCog } from 'lucide-angular';
import { RhOwner } from '../../models/rh-owner.model';

@Component({
  selector: 'app-rh-list',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './rh-list.component.html',
  styleUrls: ['./rh-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhListComponent {
  @Input() rhOwners: RhOwner[] = [];
  @Input() loading = false;

  @Output() search = new EventEmitter<string>();
  @Output() toggleStatus = new EventEmitter<number>();

  searchTerm = '';
  showMenuId = signal<number | null>(null);

  readonly iconSearch = Search;
  readonly iconMail = Mail;
  readonly iconBuilding = Building;
  readonly iconCalendar = Calendar;
  readonly iconMore = MoreVertical;
  readonly iconShieldOff = ShieldOff;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconUserCog = UserCog;

  onSearchChange(term: string): void {
    this.search.emit(term);
  }

  toggleMenu(event: Event, id: number): void {
    event.stopPropagation();
    this.showMenuId.update(curr => curr === id ? null : id);
  }

  onToggleStatus(event: Event, id: number): void {
    event.stopPropagation();
    this.showMenuId.set(null);
    this.toggleStatus.emit(id);
  }

  getInitials(prenom: string, nom: string): string {
    const p = prenom ? prenom.charAt(0) : '';
    const n = nom ? nom.charAt(0) : '';
    return (p + n).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#0ea5e9', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
       hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getEntrepriseBadgeColor(entrepriseName: string): string {
    const colors = ['#6366f1', '#f43f5e', '#14b8a6', '#f59e0b', '#8b5cf6', '#0ea5e9'];
    if (!entrepriseName) return '#94a3b8';
    let hash = 0;
    for (let i = 0; i < entrepriseName.length; i++) {
       hash = entrepriseName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}
