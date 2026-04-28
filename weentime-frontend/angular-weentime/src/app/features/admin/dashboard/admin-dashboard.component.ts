import { Component, inject, signal, computed, ChangeDetectionStrategy, ViewEncapsulation, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, catchError, of, finalize } from 'rxjs';
import { LucideAngularModule, Building, Users, ShieldAlert, Activity, TrendingUp, ArrowRight, RefreshCw, Settings, UserCog, Shield } from 'lucide-angular';
import { AuthService } from '../../../core/services/auth.service';
import { EntrepriseService, Entreprise } from '../entreprises/entreprise.service';
import { RhOwnerService } from '../rh-owner/rh-owner.service';
import { RoleService } from '../roles/role.service';
import { Role } from '../roles/role.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class AdminDashboardComponent {
  private authService = inject(AuthService);
  private entrepriseService = inject(EntrepriseService);
  private rhOwnerService = inject(RhOwnerService);
  private roleService = inject(RoleService);
  private destroyRef = inject(DestroyRef);

  // Icons
  readonly iconBuilding = Building;
  readonly iconUsers = Users;
  readonly iconShield = ShieldAlert;
  readonly iconActivity = Activity;
  readonly iconTrending = TrendingUp;
  readonly iconArrow = ArrowRight;
  readonly iconRefresh = RefreshCw;
  readonly iconSettings = Settings;
  readonly iconUserCog = UserCog;
  readonly iconShieldRole = Shield;

  // State
  isLoading = signal(true);
  entreprises = signal<Entreprise[]>([]);
  rhCount = signal(0);
  roles = signal<Role[]>([]);

  // Computed
  firstName = computed(() => this.authService.currentUser()?.prenom ?? 'Admin');
  todayFormatted = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

  totalEntreprises = computed(() => this.entreprises().length);
  activeEntreprises = computed(() => this.entreprises().filter(e => e.status === 'ACTIVE').length);
  inactiveEntreprises = computed(() => this.entreprises().filter(e => e.status !== 'ACTIVE').length);
  totalRoles = computed(() => this.roles().length);

  // Recent entreprises (last 5)
  recentEntreprises = computed(() =>
    [...this.entreprises()]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
  );

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);
    forkJoin({
      entreprises: this.entrepriseService.getEntreprises().pipe(catchError(() => of({ content: [] }))),
      rhOwners: this.rhOwnerService.getRhOwners().pipe(catchError(() => of([]))),
      roles: this.roleService.getAllRoles().pipe(catchError(() => of([])))
    }).pipe(
      finalize(() => this.isLoading.set(false)),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(({ entreprises, rhOwners, roles }) => {
      this.entreprises.set(entreprises.content || []);
      this.rhCount.set(Array.isArray(rhOwners) ? rhOwners.length : 0);
      this.roles.set(roles);
    });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.substring(0, 2).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
