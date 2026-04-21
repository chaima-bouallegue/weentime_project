import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

type OngletType = 'departements' | 'equipes' | 'employes' | 'managers';

interface OngletItem {
  key: OngletType;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-rh-structure',
  standalone: true,
  imports: [
    CommonModule, LucideAngularModule, RouterModule
  ],
  templateUrl: './rh-structure.component.html',
  styleUrl: './rh-structure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhStructureComponent {
  private authService = inject(AuthService);

  entrepriseNom = this.authService.currentUser()?.entreprise?.nom ?? 'Entreprise non assignée';
  hasEntreprise = !!this.authService.currentUser()?.entreprise?.id;

  onglets: OngletItem[] = [
    { key: 'departements', label: 'Départements', icon: 'building' },
    { key: 'equipes', label: 'Équipes', icon: 'git-branch' },
    { key: 'employes', label: 'Employés', icon: 'users' },
    { key: 'managers', label: 'Managers', icon: 'user-cog' }
  ];
}
