import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LucideAngularModule, Clock, CircleCheck, CircleX, Download, Users, UserPlus, Search, RefreshCw, X } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { StructureService } from '../../structure.service';
import { EmployeRH } from '../../models/structure.model';
import { EmployeFormComponent } from './employe-form/employe-form.component';
import { RhStructureStore } from '../../../../../core/services/rh-structure.store';
import { ToastService } from '../../../../../core/services/toast.service';
import { OverlayDrawerService } from '../../../../../core/services/overlay-drawer.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-employes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, LucideAngularModule],
  templateUrl: './employes.component.html',
  styleUrl: './employes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployesComponent implements OnInit {
  readonly ClockIcon = Clock;
  readonly CheckIcon = CircleCheck;
  readonly XIcon = CircleX;
  readonly DownloadIcon = Download;
  readonly UsersIcon = Users;
  readonly UserPlusIcon = UserPlus;
  readonly SearchIcon = Search;
  readonly RefreshCwIcon = RefreshCw;
  readonly CloseIcon = X;
  protected Math = Math;
  private structureStore = inject(RhStructureStore);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);
  private drawerService = inject(OverlayDrawerService);

  employes = this.structureStore.employes;
  pendingEmployes = this.structureStore.pendingEmployes;
  departements = this.structureStore.departements;
  equipes = this.structureStore.equipes;
  managers = this.structureStore.managers;
  isLoading = this.structureStore.isLoading;

  isRejecting = signal(false);

  searchQuery = signal('');
  filterDept = signal<number | null>(null);
  filterStatut = signal<'ALL' | 'ACTIF' | 'INACTIF'>('ALL');
  filterRole = signal<'ALL' | 'ROLE_MANAGER' | 'ROLE_EMPLOYEE'>('ALL');
  statusTab = signal<'ALL' | 'ACTIF' | 'INACTIF' | 'MANAGERS'>('ALL');
  currentPage = signal(1);
  pageSize = 12;

  private searchSubject = new Subject<string>();

  setStatusTab(tab: 'ALL' | 'ACTIF' | 'INACTIF' | 'MANAGERS'): void {
    this.statusTab.set(tab);
    if (tab === 'ALL') {
      this.filterStatut.set('ALL');
      this.filterRole.set('ALL');
    } else if (tab === 'ACTIF') {
      this.filterStatut.set('ACTIF');
      this.filterRole.set('ALL');
    } else if (tab === 'INACTIF') {
      this.filterStatut.set('INACTIF');
      this.filterRole.set('ALL');
    } else if (tab === 'MANAGERS') {
      this.filterStatut.set('ALL');
      this.filterRole.set('ROLE_MANAGER');
    }
    this.currentPage.set(1);
  }

  hasActiveFilters = computed(() => {
    return !!this.searchQuery().trim() || this.filterDept() !== null || this.statusTab() !== 'ALL';
  });

  resetFilters(): void {
    this.searchQuery.set('');
    this.filterDept.set(null);
    this.setStatusTab('ALL');
  }

  // ── Helper to check if role is Manager ──
  isManagerRole(emp: EmployeRH): boolean {
    const r = String(emp.role ?? '').toUpperCase();
    return r === 'ROLE_MANAGER' || r === 'MANAGER';
  }

  // ── Unified staff list (Collaborateurs + Managers, excluding pending users) ──
  allEmployees = computed(() => {
    const emps = this.employes();
    const mgrs = this.managers();
    const pendingIds = new Set(this.pendingEmployes().map(p => p.id));

    const isPending = (e: EmployeRH) => {
      const s = String(e.statut ?? '').toUpperCase();
      return pendingIds.has(e.id) || s === 'PENDING' || s === 'EN_ATTENTE' || s.includes('PENDING') || s.includes('ATTENTE');
    };

    const staffMap = new Map<number, EmployeRH>();

    // 1. Add employees (excluding pending)
    for (const emp of emps) {
      if (!isPending(emp)) {
        staffMap.set(emp.id, emp);
      }
    }

    // 2. Add managers (ensuring role is ROLE_MANAGER, excluding pending)
    for (const mgr of mgrs) {
      if (!isPending(mgr)) {
        const existing = staffMap.get(mgr.id);
        staffMap.set(mgr.id, {
          ...(existing ?? mgr),
          role: 'ROLE_MANAGER'
        });
      }
    }

    return Array.from(staffMap.values());
  });

  // ── Aggregate stats ──
  totalEmployees = computed(() => this.allEmployees().length);
  activeCount = computed(() => this.allEmployees().filter(e => e.statut === 'ACTIF').length);
  inactiveCount = computed(() => this.allEmployees().filter(e => e.statut === 'INACTIF').length);
  managerCount = computed(() => this.allEmployees().filter(e => this.isManagerRole(e)).length);

  filteredEmployes = computed(() => {
    let list = this.allEmployees();
    const query = this.searchQuery().toLowerCase().trim();
    const dept = this.filterDept();
    const statut = this.filterStatut();
    const role = this.filterRole();

    if (query) {
      list = list.filter(e =>
        e.nom.toLowerCase().includes(query) ||
        e.prenom.toLowerCase().includes(query) ||
        e.email.toLowerCase().includes(query) ||
        e.poste.toLowerCase().includes(query)
      );
    }
    if (dept) list = list.filter(e => e.departementId === dept);
    if (statut !== 'ALL') list = list.filter(e => e.statut === statut);
    if (role === 'ROLE_MANAGER') list = list.filter(e => this.isManagerRole(e));
    if (role === 'ROLE_EMPLOYEE') list = list.filter(e => !this.isManagerRole(e));
    return list;
  });

  paginatedEmployes = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredEmployes().slice(start, start + this.pageSize);
  });

  totalPages = computed(() => Math.ceil(this.filteredEmployes().length / this.pageSize) || 1);

  constructor() {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(q => {
      this.searchQuery.set(q);
      this.currentPage.set(1);
    });
  }

  ngOnInit(): void {
    if (this.employes().length === 0 || this.managers().length === 0) {
      this.refresh();
    }
  }

  refresh(): void {
    this.structureStore.loadAll(true).subscribe();
  }

  onSearchInput(value: string): void {
    this.searchSubject.next(value);
  }

  setDeptFilter(deptId: number | null): void {
    this.filterDept.set(deptId);
    this.currentPage.set(1);
  }

  setStatutFilter(statut: 'ALL' | 'ACTIF' | 'INACTIF'): void {
    this.filterStatut.set(statut);
    this.currentPage.set(1);
  }

  setRoleFilter(role: string): void {
    this.filterRole.set(role as 'ALL' | 'ROLE_MANAGER' | 'ROLE_EMPLOYEE');
    this.currentPage.set(1);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: number[] = [1];
    if (current > 3) pages.push(-1); // ellipsis
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
      pages.push(i);
    }
    if (current < total - 2) pages.push(-1); // ellipsis
    pages.push(total);
    return pages;
  }

  onToggleStatus(id: number): void {
    this.structureService.toggleEmployeStatus(id).subscribe(() => this.refresh());
  }

  onEditEmployee(emp: EmployeRH): void {
    const ref = this.drawerService.open<EmployeFormComponent>({
      component: EmployeFormComponent,
      inputs: {
        employee: emp,
        embedded: true,
        departements: this.departements(),
        equipes: this.equipes(),
        managers: this.managers(),
        title: 'Modifier le profil',
        submitLabel: 'Enregistrer les modifications',
      } as unknown as Partial<EmployeFormComponent>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).close?.subscribe(() => this.drawerService.close());
    (ref.componentRef.instance as any).saved?.subscribe(() => { this.drawerService.close(); this.refresh(); });
  }

  onDeleteEmployee(emp: EmployeRH): void {
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Supprimer « ${emp.prenom} ${emp.nom} » ?`,
        message: 'Cette action est irréversible. Le compte sera définitivement supprimé.',
        confirmText: 'Supprimer',
        iconName: 'trash-2',
        type: 'danger',
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.structureService.deleteEmploye(emp.id).subscribe({
        next: () => {
          this.toastService.success(`${emp.prenom} ${emp.nom} a été supprimé.`);
          this.refresh();
        },
        error: () => {
          this.toastService.error('Une erreur est survenue lors de la suppression.');
        }
      });
    });
    (ref.componentRef.instance as any).cancel?.subscribe(() => this.drawerService.close());
  }

  openCreateEmployee(): void {
    const ref = this.drawerService.open<EmployeFormComponent>({
      component: EmployeFormComponent,
      inputs: {
        employee: null,
        embedded: true,
        departements: this.departements(),
        equipes: this.equipes(),
        managers: this.managers(),
      } as unknown as Partial<EmployeFormComponent>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).close?.subscribe(() => this.drawerService.close());
    (ref.componentRef.instance as any).saved?.subscribe(() => { this.drawerService.close(); this.refresh(); });
  }

  onOpenValidation(user: EmployeRH): void {
    const ref = this.drawerService.open<EmployeFormComponent>({
      component: EmployeFormComponent,
      inputs: {
        pendingUser: user,
        employee: null,
        isValidationMode: true,
        embedded: true,
        departements: this.departements(),
        equipes: this.equipes(),
        managers: this.managers(),
      } as unknown as Partial<EmployeFormComponent>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).close?.subscribe(() => this.drawerService.close());
    (ref.componentRef.instance as any).saved?.subscribe(() => { this.drawerService.close(); this.refresh(); });
    (ref.componentRef.instance as any).validate?.subscribe((ev: { id: number; request: any }) => {
      this.structureService.validateUser(ev.id, ev.request).subscribe({
        next: () => {
          this.drawerService.close();
          this.toastService.success('Le collaborateur a été validé avec succès.');
          this.refresh();
        },
        error: () => {
          this.toastService.error('Une erreur est survenue lors de la validation.');
        }
      });
    });
  }

  onOpenReject(user: EmployeRH): void {
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Rejeter l'inscription de « ${user.prenom} ${user.nom} » ?`,
        message: 'Cette action supprimera définitivement le compte en attente.',
        confirmText: 'Rejeter',
        iconName: 'x',
        type: 'danger',
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.isRejecting.set(true);
      this.structureService.rejectUser(user.id).subscribe({
        next: () => {
          this.isRejecting.set(false);
          this.toastService.success("La demande d'inscription a été rejetée et supprimée.");
          this.refresh();
        },
        error: () => {
          this.isRejecting.set(false);
          this.toastService.error('Une erreur est survenue lors du rejet.');
        }
      });
    });
  }

  getInitials(prenom: string, nom: string): string {
    return ((prenom[0] ?? '') + (nom[0] ?? '')).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  exportCSV(): void {
    const list = this.filteredEmployes();
    if (list.length === 0) {
      this.toastService.error('Aucun employé à exporter.');
      return;
    }

    const headers = [
      'ID',
      'Prénom',
      'Nom',
      'Email',
      'Téléphone',
      'Poste',
      'Rôle',
      'Département',
      'Équipe',
      'Statut',
      'Date de création'
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = list.map(emp => [
      escapeCsv(emp.id),
      escapeCsv(emp.prenom),
      escapeCsv(emp.nom),
      escapeCsv(emp.email),
      escapeCsv(emp.telephone || '—'),
      escapeCsv(emp.poste),
      escapeCsv(this.isManagerRole(emp) ? 'Manager' : 'Collaborateur'),
      escapeCsv(emp.departementNom || '—'),
      escapeCsv(emp.equipeNom || '—'),
      escapeCsv(emp.statut === 'ACTIF' ? 'Actif' : 'Inactif'),
      escapeCsv(emp.dateCreation ? new Date(emp.dateCreation).toLocaleDateString('fr-FR') : '—')
    ].join(';'));

    // UTF-8 BOM for French Excel compatibility
    const csvContent = '\ufeff' + headers.join(';') + '\n' + rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().split('T')[0];
    link.download = `annuaire-employes-${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.toastService.success(`${list.length} employé(s) exporté(s) en CSV avec succès.`);
  }
}
