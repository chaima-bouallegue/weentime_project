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
  Edit3,      // <-- Ajout de l'icône d'édition
  Trash2      // <-- Ajout de l'icône de suppression
} from 'lucide-angular';
import { Role, RoleNom } from '../../role.model';

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

  // Icônes de structure et statuts
  readonly iconShield = Shield;
  readonly iconShieldAlert = ShieldAlert;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconUserCheck = UserCheck;
  readonly iconBriefcase = Briefcase;
  readonly iconUserCog = UserCog;

  // Icônes d'actions mappées pour le template harmonisé
  readonly iconEdit = Edit3;
  readonly iconDelete = Trash2;

  getRoleIcon(nom: RoleNom): any {
    switch (nom) {
      case RoleNom.ROLE_ADMIN: return this.iconShieldAlert;
      case RoleNom.ROLE_RH: return this.iconUserCog;
      case RoleNom.ROLE_MANAGER: return this.iconBriefcase;
      case RoleNom.ROLE_EMPLOYEE: return this.iconUserCheck;
      default: return this.iconShield;
    }
  }

  getRoleColor(nom: RoleNom): string {
    switch (nom) {
      case RoleNom.ROLE_ADMIN: return '#ef4444';    // Rose / Rouge
      case RoleNom.ROLE_RH: return '#4f46e5';       // Indigo (Harmonisé avec WeenTime)
      case RoleNom.ROLE_MANAGER: return '#f59e0b';  // Amber
      case RoleNom.ROLE_EMPLOYEE: return '#10b981'; // Emerald
      default: return '#64748b';                    // Slate
    }
  }

  /**
   * Nettoie le nom technique pour l'affichage utilisateur (ex: ROLE_USER_CONTRAT -> User Contrat)
   */
  getRoleLabel(nom: RoleNom): string {
    if (!nom) return '';

    return nom
      .replace('ROLE_', '')
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}