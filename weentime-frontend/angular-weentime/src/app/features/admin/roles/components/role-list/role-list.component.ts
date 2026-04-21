import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Shield, ShieldAlert, ShieldCheck, UserCheck, Briefcase, UserCog } from 'lucide-angular';
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

  readonly iconShield = Shield;
  readonly iconShieldAlert = ShieldAlert;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconUserCheck = UserCheck;
  readonly iconBriefcase = Briefcase;
  readonly iconUserCog = UserCog;

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
      case RoleNom.ROLE_ADMIN: return '#ef4444'; // Red pour le niveau sécurité max
      case RoleNom.ROLE_RH: return '#0ea5e9'; // Sky blue
      case RoleNom.ROLE_MANAGER: return '#f59e0b'; // Amber
      case RoleNom.ROLE_EMPLOYEE: return '#10b981'; // Emerald
      default: return '#64748b'; // Slate
    }
  }

  getRoleLabel(nom: RoleNom): string {
    return nom.replace('ROLE_', '').replace('_', ' ');
  }
}
