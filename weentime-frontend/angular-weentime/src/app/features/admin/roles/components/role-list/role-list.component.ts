import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  LucideAngularModule,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Briefcase,
  UserCog,
  Edit3,
  Trash2
} from 'lucide-angular';
import { Role } from '../../role.model';

@Component({
  selector: 'app-role-list',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './role-list.component.html',
  styleUrls: ['./role-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RoleListComponent {
  @Input() roles: Role[] = [];
  @Input() loading = false;

  @Output() edit = new EventEmitter<Role>();
  @Output() delete = new EventEmitter<number>();

  readonly iconShield = Shield;
  readonly iconShieldAlert = ShieldAlert;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconUserCheck = UserCheck;
  readonly iconBriefcase = Briefcase;
  readonly iconUserCog = UserCog;
  readonly iconEdit = Edit3;
  readonly iconDelete = Trash2;

  getRoleIcon(nom: string): any {
    switch (nom) {
      case 'ROLE_ADMIN': return this.iconShieldAlert;
      case 'ROLE_RH': return this.iconUserCog;
      case 'ROLE_MANAGER': return this.iconBriefcase;
      case 'ROLE_EMPLOYEE': return this.iconUserCheck;
      default: return this.iconShield; // rôles custom
    }
  }

  getRoleColor(nom: string): string {
    switch (nom) {
      case 'ROLE_ADMIN': return '#ef4444';
      case 'ROLE_RH': return '#4f46e5';
      case 'ROLE_MANAGER': return '#f59e0b';
      case 'ROLE_EMPLOYEE': return '#10b981';
      default: return '#64748b'; // rôles custom → slate
    }
  }

  /**
   * Nettoie le nom technique pour l'affichage (ex: ROLE_PHARMACIE → Pharmacie)
   */
  getRoleLabel(nom: string): string {
    if (!nom) return '';
    return nom
      .replace('ROLE_', '')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}