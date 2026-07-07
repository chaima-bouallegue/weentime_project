import { Component, inject, signal, computed, ChangeDetectionStrategy, effect, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import jsPDF from 'jspdf';

import { AuthService } from '../../../core/services/auth.service';
import { RhStructureStore } from '../../../core/services/rh-structure.store';
import { StructureService } from './structure.service';
import { ToastService } from '../../../core/services/toast.service';
import { OverlayDrawerService } from '../../../core/services/overlay-drawer.service';
import { Departement, Equipe, EmployeRH } from './models/structure.model';
import type { DepartementFormComponent as DeptForm } from './components/departements/departement-form/departement-form.component';
import type { EquipeFormComponent as EqForm } from './components/equipes/equipe-form/equipe-form.component';
import type { EmployeFormComponent as EmpForm } from './components/employes/employe-form/employe-form.component';
import { DepartementFormComponent } from './components/departements/departement-form/departement-form.component';
import { EquipeFormComponent } from './components/equipes/equipe-form/equipe-form.component';
import { EmployeFormComponent } from './components/employes/employe-form/employe-form.component';
import { ManagerFormComponent } from './components/managers/manager-form/manager-form.component';
import { PendingRequestsOverlayComponent } from './components/pending-requests-overlay/pending-requests-overlay.component';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-rh-structure',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    FormsModule,
    RouterModule,
    ManagerFormComponent,

  ],
  templateUrl: './rh-structure.component.html',
  styleUrl: './rh-structure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.orgchart-active]': 'showOrgChartComingSoon()'
  }
})
export class RhStructureComponent implements OnDestroy {
  private authService = inject(AuthService);
  protected structureStore = inject(RhStructureStore);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);
  private drawerService = inject(OverlayDrawerService);

  constructor() {
    // Automatically expand all loaded departments by default on load
    effect(() => {
      const depts = this.structureStore.departements();
      if (depts.length > 0) {
        const current = this.expandedDepartments();
        if (current.size === 0) {
          this.expandedDepartments.set(new Set(depts.map(d => d.id)));
        }
      }
    });

    // Manage body class when organigramme is open
    effect(() => {
      const isOpen = this.showOrgChartComingSoon();
      if (isOpen) {
        document.body.classList.add('orgchart-open');
      } else {
        document.body.classList.remove('orgchart-open');
      }
    });

    // Body class management for any open drawer (CDK overlay)
    effect(() => {
      document.body.classList.toggle('structure-drawer-open', this.drawerService.isOpen());
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('structure-drawer-open');
  }

  entrepriseNom = this.authService.currentUser()?.entreprise?.nom ?? 'Entreprise non assignée';
  hasEntreprise = !!this.authService.currentUser()?.entreprise?.id;

  // Search & Expansion State
  searchSidebar = signal('');
  searchEmployee = signal('');
  expandedDepartments = signal<Set<number>>(new Set());
  expandedTeams = signal<Set<number>>(new Set());

  // Explorer Selection State
  selectedDepartmentId = signal<number | null>(null);
  selectedTeamId = signal<number | null>(null);
  filterStatut = signal<'ALL' | 'ACTIF' | 'INACTIF'>('ALL');

  // Pagination State
  pageSize = signal<number>(
    Number(localStorage.getItem('employees-page-size') ?? '10') || 10
  );
  currentPage = signal<number>(1);

  // Pagination Computed Properties
  paginatedEmployees = computed(() => {
    const all = this.selectedTeamEmployees();
    const size = this.pageSize();
    const maxPage = Math.max(1, Math.ceil(all.length / size));
    const page = Math.min(this.currentPage(), maxPage);
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  totalPages = computed(() => Math.max(1, Math.ceil(this.selectedTeamEmployees().length / this.pageSize())));

  startIndex = computed(() => {
    if (this.selectedTeamEmployees().length === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  endIndex = computed(() => Math.min(this.currentPage() * this.pageSize(), this.selectedTeamEmployees().length));

  // Reactive Explorer selection resolvers
  selectedDepartment = computed(() => {
    const id = this.selectedDepartmentId();
    const depts = this.structureStore.departements();
    if (depts.length === 0) return null;
    if (id === null) {
      // Default to first department that has teams, or just the first
      const firstWithTeams = depts.find(d => this.structureStore.equipes().some(t => t.departementId === d.id));
      return firstWithTeams || depts[0];
    }
    return depts.find(d => d.id === id) || depts[0];
  });

  selectedTeam = computed(() => {
    const teamId = this.selectedTeamId();
    const activeDept = this.selectedDepartment();
    if (!activeDept) return null;
    const deptTeams = this.structureStore.equipes().filter(t => t.departementId === activeDept.id);
    if (deptTeams.length === 0) return null;
    if (teamId === null) {
      return deptTeams[0];
    }
    return deptTeams.find(t => t.id === teamId) || deptTeams[0];
  });

  selectedTeamEmployees = computed(() => {
    const team = this.selectedTeam();
    if (!team) return [];
    const query = this.searchEmployee().trim().toLowerCase();
    const status = this.filterStatut();

    let emps = this.structureStore.employes().filter(e => e.equipeId === team.id);
    if (status !== 'ALL') {
      emps = emps.filter(e => e.statut === status);
    }

    if (!query) return emps;
    return emps.filter(e =>
      e.nom.toLowerCase().includes(query) ||
      e.prenom.toLowerCase().includes(query) ||
      e.email.toLowerCase().includes(query) ||
      e.poste.toLowerCase().includes(query)
    );
  });

  selectDepartment(deptId: number): void {
    this.selectedDepartmentId.set(deptId);
    const firstTeam = this.structureStore.equipes().find(t => t.departementId === deptId);
    this.selectedTeamId.set(firstTeam?.id ?? null);
    this.currentPage.set(1);
  }

  selectTeam(teamId: number, deptId: number): void {
    this.selectedDepartmentId.set(deptId);
    this.selectedTeamId.set(teamId);
    this.currentPage.set(1);
  }

  // Search & Filter handlers (reset pagination)
  onSearchChange(value: string): void {
    this.searchEmployee.set(value);
    this.currentPage.set(1);
  }

  onFilterChange(value: string): void {
    this.filterStatut.set(value as 'ALL' | 'ACTIF' | 'INACTIF');
    this.currentPage.set(1);
  }

  // Pagination Navigation
  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;
    this.currentPage.set(page);
  }

  setPageSize(size: number): void {
    localStorage.setItem('employees-page-size', String(size));
    this.pageSize.set(size);
    this.currentPage.set(1);
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.currentPage();
    const maxVisible = 7;
    const pages: number[] = [];

    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      let start = Math.max(1, current - 3);
      let end = Math.min(total, current + 3);
      if (end - start < maxVisible - 1) {
        if (start === 1) end = Math.min(total, start + maxVisible - 1);
        else start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  }

  // ── Employee Action Menu Overlay ──
  activeMenuEmployee = signal<EmployeRH | null>(null);
  menuStyle = signal<Record<string, string>>({});

  openEmployeeMenu(emp: EmployeRH, event: MouseEvent): void {
    event.stopPropagation();
    const btn = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();

    if (this.activeMenuEmployee()?.id === emp.id) {
      this.closeEmployeeMenu();
      return;
    }

    const menuWidth = 200;
    const menuHeight = 160;
    let top = rect.bottom + 4;
    const right = Math.max(4, window.innerWidth - rect.right);

    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 4;
    }

    this.menuStyle.set({
      position: 'fixed',
      top: `${top}px`,
      right: `${right}px`,
      zIndex: '10050'
    });
    this.activeMenuEmployee.set(emp);
  }

  closeEmployeeMenu(): void {
    this.activeMenuEmployee.set(null);
    this.menuStyle.set({});
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    this.closeEmployeeMenu();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.activeMenuEmployee()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.employee-menu-overlay') && !target.closest('.employee-menu-trigger')) {
      this.closeEmployeeMenu();
    }
  }

  // Drawer & Modal triggers
  selectedPendingUser = signal<EmployeRH | null>(null);
  isValidationMode = signal(false);

  showAssignManagerModal = signal(false);
  teamToAssignManager = signal<Equipe | null>(null);

  isDeleting = signal(false);
  isRejecting = signal(false);

  // Org Chart dialogue
  showOrgChartComingSoon = signal(false);

  // ── Organigramme State ──
  orgZoom = signal(0.85);
  orgSearchQuery = signal('');
  orgExpandedDepts = signal<Set<number>>(new Set());
  orgExpandedTeams = signal<Set<number>>(new Set());
  orgAllExpanded = signal(false);
  selectedOrgTeam = signal<Equipe | null>(null);

  // Department accent colors (matching the mockup palette)
  private readonly orgDeptColors = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444'];

  // Expose Math for template
  Math = Math;

  // Reactive Hierarchy Filtering & Autocomputing
  filteredStructure = computed(() => {
    const depts = this.structureStore.departements();
    const teams = this.structureStore.equipes();
    const emps = this.structureStore.employes();
    const managers = this.structureStore.managers();
    const query = this.searchSidebar().trim().toLowerCase();

    const matchingDepts = new Set<number>();
    const matchingTeams = new Set<number>();

    const result = depts.map(dept => {
      const deptTeams = teams.filter(t => t.departementId === dept.id);
      const deptEmployees = emps.filter(e => e.departementId === dept.id);
      const deptManagers = managers.filter(m => m.departementId === dept.id);

      const filteredTeams = deptTeams.map(team => {
        const teamEmployees = emps.filter(e => e.equipeId === team.id);

        let filteredEmployees = teamEmployees;
        if (query) {
          filteredEmployees = teamEmployees.filter(e =>
            e.nom.toLowerCase().includes(query) ||
            e.prenom.toLowerCase().includes(query) ||
            e.email.toLowerCase().includes(query) ||
            e.poste.toLowerCase().includes(query)
          );
        }

        const hasEmployeeMatch = filteredEmployees.length > 0;
        const isTeamNameMatch = query ? team.nom.toLowerCase().includes(query) : false;

        if (hasEmployeeMatch || isTeamNameMatch) {
          matchingDepts.add(dept.id);
          matchingTeams.add(team.id);
        }

        return {
          ...team,
          employees: filteredEmployees,
          manager: team.managerId ? managers.find(m => m.id === team.managerId) : null,
          visible: !query || isTeamNameMatch || hasEmployeeMatch
        };
      }).filter(t => t.visible);

      const hasTeamMatch = filteredTeams.length > 0;
      const isDeptNameMatch = query ? dept.nom.toLowerCase().includes(query) : false;

      if (isDeptNameMatch) {
        matchingDepts.add(dept.id);
      }

      return {
        ...dept,
        teams: filteredTeams,
        visible: !query || isDeptNameMatch || hasTeamMatch,
        nombreEquipesCalculated: deptTeams.length,
        nombreEmployesCalculated: deptEmployees.length,
        nombreManagersCalculated: deptManagers.length
      };
    }).filter(d => d.visible);

    if (query) {
      setTimeout(() => {
        const currentDepts = this.expandedDepartments();
        const currentTeams = this.expandedTeams();

        let changed = false;
        const newDepts = new Set(currentDepts);
        const newTeams = new Set(currentTeams);

        matchingDepts.forEach(id => { if (!newDepts.has(id)) { newDepts.add(id); changed = true; } });
        matchingTeams.forEach(id => { if (!newTeams.has(id)) { newTeams.add(id); changed = true; } });

        if (changed) {
          this.expandedDepartments.set(newDepts);
          this.expandedTeams.set(newTeams);
        }
      }, 30);
    }

    return result;
  });

  refresh(): void {
    this.structureStore.loadAll(true).subscribe();
  }

  // Toggles
  toggleDepartment(id: number): void {
    const set = new Set(this.expandedDepartments());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.expandedDepartments.set(set);
  }

  toggleTeam(id: number): void {
    const set = new Set(this.expandedTeams());
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.expandedTeams.set(set);
  }

  // ── Drawer Helpers ──
  private openDrawer<T>(component: any, inputs: Partial<T>, onSaved?: () => void): void {
    const ref = this.drawerService.open<T>({
      component,
      inputs: { ...inputs, embedded: true } as unknown as Partial<T>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any)['close']?.subscribe?.(() => {
      this.drawerService.close();
    });
    (ref.componentRef.instance as any)['saved']?.subscribe?.(() => {
      this.drawerService.close();
      onSaved?.();
    });
  }

  // CRUD Departements
  openCreateDept(): void {
    this.openDrawer<DeptForm>(DepartementFormComponent, { departement: null }, () => this.refresh());
  }

  openEditDept(dept: Departement): void {
    this.openDrawer<DeptForm>(DepartementFormComponent, { departement: dept }, () => this.refresh());
  }

  confirmDeleteDept(dept: Departement): void {
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Supprimer le département « ${dept.nom} » ?`,
        message: 'Cette action est irréversible et supprimera toutes les équipes et collaborateurs associés.',
        confirmText: 'Supprimer',
        iconName: 'alert-triangle',
        type: 'danger',
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.isDeleting.set(true);
      this.structureService.deleteDepartement(dept.id).subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.toastService.success('Département supprimé');
          this.structureStore.deleteDepartement(dept.id);
          this.refresh();
        },
        error: () => this.isDeleting.set(false)
      });
    });
  }

  // CRUD Equipes
  openCreateTeam(deptId?: number): void {
    const defaultDeptId = deptId ?? null;
    this.openDrawer<EqForm>(EquipeFormComponent, {
      equipe: null,
      departements: this.structureStore.departements(),
      managers: this.structureStore.managers(),
    }, () => this.refresh());
  }

  openEditTeam(team: Equipe): void {
    this.openDrawer<EqForm>(EquipeFormComponent, {
      equipe: team,
      departements: this.structureStore.departements(),
      managers: this.structureStore.managers(),
    }, () => this.refresh());
  }

  confirmDeleteTeam(team: Equipe): void {
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Supprimer l'équipe « ${team.nom} » ?`,
        message: 'Cette action est irréversible et retirera tous les membres de cette équipe.',
        confirmText: 'Supprimer',
        iconName: 'alert-triangle',
        type: 'danger',
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.isDeleting.set(true);
      this.structureService.deleteEquipe(team.id).subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.toastService.success('Équipe supprimée');
          this.structureStore.deleteEquipe(team.id);
          this.refresh();
        },
        error: () => this.isDeleting.set(false)
      });
    });
  }

  // Team Manager Actions
  openAssignManager(team: Equipe): void {
    this.teamToAssignManager.set(team);
    this.showAssignManagerModal.set(true);
  }

  onManagerAssigned(): void {
    this.showAssignManagerModal.set(false);
    this.toastService.success('Manager assigné avec succès');
    this.refresh();
  }

  // CRUD Employees
  openCreateEmployee(): void {
    this.openDrawer<EmpForm>(EmployeFormComponent, {
      employee: null,
      departements: this.structureStore.departements(),
      equipes: this.structureStore.equipes(),
      managers: this.structureStore.managers(),
    }, () => this.refresh());
  }

  openEditEmployee(emp: EmployeRH): void {
    this.openDrawer<EmpForm>(EmployeFormComponent, {
      employee: emp,
      departements: this.structureStore.departements(),
      equipes: this.structureStore.equipes(),
      managers: this.structureStore.managers(),
    }, () => this.refresh());
  }

  confirmDeleteEmployee(emp: EmployeRH): void {
    const ref = this.drawerService.openModal<ConfirmDialogComponent>({
      component: ConfirmDialogComponent,
      inputs: {
        title: `Supprimer le collaborateur « ${emp.prenom} ${emp.nom} » ?`,
        message: 'Cette action supprimera définitivement le compte utilisateur de ce collaborateur.',
        confirmText: 'Supprimer',
        iconName: 'alert-triangle',
        type: 'danger',
      },
      panelClass: 'overlay-modal-panel',
    });
    (ref.componentRef.instance as any).confirm.subscribe(() => {
      this.drawerService.close();
      this.isDeleting.set(true);
      this.structureService.deleteEmploye(emp.id).subscribe({
        next: () => {
          this.isDeleting.set(false);
          this.toastService.success('Collaborateur supprimé');
          this.refresh();
        },
        error: () => {
          this.isDeleting.set(false);
          this.toastService.error('Une erreur est survenue lors de la suppression');
        }
      });
    });
  }

  onToggleEmployeeStatus(emp: EmployeRH): void {
    this.structureService.toggleEmployeStatus(emp.id).subscribe({
      next: () => {
        this.toastService.success(`Collaborateur ${emp.statut === 'ACTIF' ? 'désactivé' : 'activé'}`);
        this.refresh();
      },
      error: () => {
        this.toastService.error('Erreur lors du changement de statut');
      }
    });
  }

  // Pending Requests Drawer via CDK Overlay
  openPendingDrawer(): void {
    const ref = this.drawerService.open<PendingRequestsOverlayComponent>({
      component: PendingRequestsOverlayComponent,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).validateUser.subscribe((user: EmployeRH) => {
      this.drawerService.close();
      this.onOpenValidation(user);
    });
    (ref.componentRef.instance as any).rejectUser.subscribe((user: EmployeRH) => {
      this.drawerService.close();
      this.onOpenReject(user);
    });
  }

  // Pending Approvals Panel
  onOpenValidation(user: EmployeRH): void {
    const ref = this.drawerService.open<EmpForm>({
      component: EmployeFormComponent,
      inputs: {
        pendingUser: user,
        employee: null,
        isValidationMode: true,
        embedded: true,
        departements: this.structureStore.departements(),
        equipes: this.structureStore.equipes(),
        managers: this.structureStore.managers(),
      } as unknown as Partial<EmpForm>,
      panelClass: ['overlay-drawer-panel', 'width-md'],
    });
    (ref.componentRef.instance as any).close?.subscribe(() => this.drawerService.close());
    (ref.componentRef.instance as any).saved?.subscribe(() => { this.drawerService.close(); this.refresh(); });
    (ref.componentRef.instance as any).validate?.subscribe((ev: { id: number; request: any }) => {
      this.onValidate(ev.id, ev.request);
    });
  }

  onValidate(id: number, request: any): void {
    this.structureService.validateUser(id, request).subscribe({
      next: () => {
        this.selectedPendingUser.set(null);
        this.isValidationMode.set(false);
        this.toastService.success('Le collaborateur a été validé avec succès.');
        this.refresh();
      },
      error: () => {
        this.toastService.error('Une erreur est survenue lors de la validation.');
      }
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
          this.toastService.success("La demande d'inscription a été rejetée.");
          this.refresh();
        },
        error: () => {
          this.isRejecting.set(false);
          this.toastService.error('Une erreur est survenue lors du rejet.');
        }
      });
    });
  }

  // Helpers
  getInitials(prenom: string, nom: string): string {
    return ((prenom?.[0] ?? '') + (nom?.[0] ?? '')).toUpperCase() || '??';
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  getEmployeeManagerName(emp: EmployeRH): string {
    if (emp.role === 'ROLE_MANAGER') {
      return 'Lui-même (Manager)';
    }
    if (emp['managerId']) {
      const mgr = this.structureStore.managers().find(m => m.id === emp['managerId']);
      if (mgr) return `${mgr.prenom} ${mgr.nom}`;
    }
    if (emp.equipeId) {
      const team = this.structureStore.equipes().find(eq => eq.id === emp.equipeId);
      if (team?.managerNom) return team.managerNom;
    }
    return 'Non assigné';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  getManagerForTeam(team: Equipe | null): EmployeRH | null {
    if (!team?.managerId) return null;
    return this.structureStore.managers().find(m => m.id === team.managerId) ?? null;
  }

  // ── Organigramme Methods ──

  toggleOrgDept(id: number): void {
    const set = new Set(this.orgExpandedDepts());
    if (set.has(id)) { set.delete(id); } else { set.add(id); }
    this.orgExpandedDepts.set(set);
  }

  toggleOrgTeam(id: number): void {
    const set = new Set(this.orgExpandedTeams());
    if (set.has(id)) { set.delete(id); } else { set.add(id); }
    this.orgExpandedTeams.set(set);
  }

  toggleOrgExpandAll(): void {
    if (this.orgAllExpanded()) {
      this.orgExpandedDepts.set(new Set());
      this.orgExpandedTeams.set(new Set());
      this.orgAllExpanded.set(false);
    } else {
      this.orgExpandedDepts.set(new Set(this.structureStore.departements().map(d => d.id)));
      this.orgExpandedTeams.set(new Set(this.structureStore.equipes().map(t => t.id)));
      this.orgAllExpanded.set(true);
    }
  }

  isOrgHighlighted(name: string): boolean {
    const q = this.orgSearchQuery().trim().toLowerCase();
    if (!q) return false;
    return name.toLowerCase().includes(q);
  }

  getOrgDeptTeams(deptId: number): Equipe[] {
    return this.structureStore.equipes().filter(t => t.departementId === deptId);
  }

  getOrgDeptEmployees(deptId: number): EmployeRH[] {
    return this.structureStore.employes().filter(e => e.departementId === deptId);
  }

  getOrgTeamEmployees(teamId: number): EmployeRH[] {
    return this.structureStore.employes().filter(e => e.equipeId === teamId);
  }

  getFilteredOrgDepts(): Departement[] {
    const q = this.orgSearchQuery().trim().toLowerCase();
    if (!q) return this.structureStore.departements();
    return this.structureStore.departements().filter(d => {
      if (d.nom.toLowerCase().includes(q)) return true;
      const teams = this.getOrgDeptTeams(d.id);
      if (teams.some(t => t.nom.toLowerCase().includes(q))) return true;
      const emps = this.getOrgDeptEmployees(d.id);
      return emps.some(e => (e.prenom + ' ' + e.nom).toLowerCase().includes(q) || e.poste.toLowerCase().includes(q));
    });
  }

  getFilteredOrgTeams(deptId: number): Equipe[] {
    const q = this.orgSearchQuery().trim().toLowerCase();
    const teams = this.getOrgDeptTeams(deptId);
    if (!q) return teams;
    return teams.filter(t => {
      if (t.nom.toLowerCase().includes(q)) return true;
      const emps = this.getOrgTeamEmployees(t.id);
      return emps.some(e => (e.prenom + ' ' + e.nom).toLowerCase().includes(q) || e.poste.toLowerCase().includes(q));
    });
  }

  getFilteredOrgEmployees(teamId: number): EmployeRH[] {
    const q = this.orgSearchQuery().trim().toLowerCase();
    const emps = this.getOrgTeamEmployees(teamId);
    if (!q) return emps;
    return emps.filter(e => (e.prenom + ' ' + e.nom).toLowerCase().includes(q) || e.poste.toLowerCase().includes(q));
  }

  getDeptBarWidth(): string {
    const count = this.getFilteredOrgDepts().length;
    if (count <= 1) return '0px';
    return `calc(${(count - 1) * 280}px)`;
  }

  getTeamBarWidth(deptId: number): string {
    const count = this.getFilteredOrgTeams(deptId).length;
    if (count <= 1) return '0px';
    return `calc(${(count - 1) * 260}px)`;
  }

  getEmpBarWidth(teamId: number): string {
    const count = this.getFilteredOrgEmployees(teamId).length;
    if (count <= 1) return '0px';
    return `calc(${(count - 1) * 220}px)`;
  }

  selectOrgTeam(team: Equipe): void {
    this.selectedOrgTeam.set(
      this.selectedOrgTeam()?.id === team.id ? null : team
    );
  }

  getOrgDeptColor(index: number): string {
    return this.orgDeptColors[index % this.orgDeptColors.length];
  }

  getOrgDeptManagerName(deptId: number): string {
    const teams = this.getOrgDeptTeams(deptId);
    const teamWithManager = teams.find(t => t.managerNom);
    return teamWithManager?.managerNom || 'Non assigné';
  }

  getOrgDeptManagerRole(deptId: number): string {
    const teams = this.getOrgDeptTeams(deptId);
    const first = teams.find(t => t.managerNom);
    if (!first) return 'Responsable';
    // Derive a plausible role title based on department name
    const dept = this.structureStore.departements().find(d => d.id === deptId);
    if (dept) {
      const name = dept.nom.toLowerCase();
      if (name.includes('inform') || name.includes('tech') || name.includes('it')) return 'Directeur IT';
      if (name.includes('rh') || name.includes('humain')) return 'Directeur RH';
      if (name.includes('financ') || name.includes('compta')) return 'Directeur Finance';
      if (name.includes('market')) return 'Directeur Marketing';
      if (name.includes('comm')) return 'Directeur Communication';
    }
    return 'Responsable';
  }

  exportOrgChartToPdf(): void {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Colors
    const primaryColor: [number, number, number] = [79, 70, 229]; // Indigo
    const darkSlate: [number, number, number] = [15, 23, 42]; // Slate-900
    const lightGray: [number, number, number] = [241, 245, 249]; // Slate-100
    const lineGray: [number, number, number] = [209, 213, 219]; // Gray-300

    // Title & Header on the PDF
    doc.setFillColor(...lightGray);
    doc.rect(0, 0, pageW, 12, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text('ORGANIGRAMME D\'ENTREPRISE', 15, 8);

    // Right-aligned date
    const dateStr = new Date().toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    doc.text(`Exporté le : ${dateStr}`, pageW - 15, 8, { align: 'right' });

    // Draw CEO Box
    const ceoW = 75;
    const ceoH = 22;
    const ceoX = (pageW - ceoW) / 2;
    const ceoY = 20;

    // CEO Box background
    doc.setFillColor(...primaryColor);
    doc.roundedRect(ceoX, ceoY, ceoW, ceoH, 3, 3, 'F');

    // CEO Text
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(this.entrepriseNom, ceoX + (ceoW / 2), ceoY + 7, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(224, 231, 255); // Indigo-100
    doc.text('Direction Générale', ceoX + (ceoW / 2), ceoY + 12, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setFillColor(255, 255, 255, 0.2); // semi-transparent white box for badge
    const badgeW = 12;
    const badgeH = 5;
    const badgeX = ceoX + (ceoW - badgeW) / 2;
    const badgeY = ceoY + 15;
    doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1, 1, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('CEO', badgeX + (badgeW / 2), badgeY + 3.8, { align: 'center' });

    // Now get departments
    const depts = this.getFilteredOrgDepts();
    const deptCount = depts.length;

    if (deptCount > 0) {
      // Connect CEO to horizontal line
      doc.setDrawColor(...lineGray);
      doc.setLineWidth(0.5);
      doc.line(pageW / 2, ceoY + ceoH, pageW / 2, ceoY + ceoH + 8); // vertical line down

      const lineY = ceoY + ceoH + 8; // Y = 50

      // Layout columns
      const sideMargin = 15;
      const availableW = pageW - (sideMargin * 2);

      const deptW = 46;
      const deptH = 22;
      const deptY = lineY + 8; // Y = 58

      const deptXCoords: number[] = [];
      if (deptCount === 1) {
        deptXCoords.push(pageW / 2);
      } else {
        const step = availableW / (deptCount - 1);
        for (let i = 0; i < deptCount; i++) {
          deptXCoords.push(sideMargin + (i * step));
        }
      }

      // Draw horizontal line connecting all departments
      if (deptCount > 1) {
        doc.line(deptXCoords[0], lineY, deptXCoords[deptCount - 1], lineY);
      }

      // Draw departments and connect them
      depts.forEach((dept, index) => {
        const dX = deptXCoords[index];

        // Vertical connector from horizontal line to department
        doc.line(dX, lineY, dX, deptY);

        // Draw Department Box
        const startX = dX - (deptW / 2);

        // Department Accent bar color
        const accentColorHex = this.getOrgDeptColor(index);
        const r = parseInt(accentColorHex.substring(1, 3), 16);
        const g = parseInt(accentColorHex.substring(3, 5), 16);
        const b = parseInt(accentColorHex.substring(5, 7), 16);

        // Box border and shadow-like feel
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(229, 231, 235); // border light gray
        doc.roundedRect(startX, deptY, deptW, deptH, 2, 2, 'FD');

        // Draw top accent bar
        doc.setFillColor(r, g, b);
        doc.rect(startX + 1, deptY + 1, deptW - 2, 2, 'F');

        // Text inside department box
        doc.setTextColor(...darkSlate);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);

        let deptName = dept.nom;
        if (deptName.length > 22) {
          deptName = deptName.substring(0, 20) + '...';
        }
        doc.text(deptName, dX, deptY + 7, { align: 'center' });

        // Manager name
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(71, 85, 105); // Slate-600
        const mgrName = this.getOrgDeptManagerName(dept.id);
        doc.text(mgrName, dX, deptY + 12, { align: 'center' });

        // Manager role
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(6.5);
        doc.setTextColor(r, g, b);
        const mgrRole = this.getOrgDeptManagerRole(dept.id);
        doc.text(mgrRole, dX, deptY + 15.5, { align: 'center' });

        // Stats
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(148, 163, 184); // Slate-400
        const teams = this.getOrgDeptTeams(dept.id);
        const emps = this.getOrgDeptEmployees(dept.id);
        doc.text(`${teams.length} éq. · ${emps.length} coll.`, dX, deptY + 19.5, { align: 'center' });

        // Draw Teams below
        const deptTeams = this.getOrgDeptTeams(dept.id);
        let currentY = deptY + deptH;

        deptTeams.forEach((team) => {
          doc.setDrawColor(...lineGray);
          doc.setLineWidth(0.3);
          doc.line(dX, currentY, dX, currentY + 6);

          currentY += 6;

          // Team Box
          const teamW = 40;
          const teamH = 12;
          const teamX = dX - (teamW / 2);

          doc.setFillColor(248, 250, 252);
          doc.setDrawColor(229, 231, 235);
          doc.roundedRect(teamX, currentY, teamW, teamH, 1.5, 1.5, 'FD');

          // Team Text
          doc.setTextColor(...darkSlate);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.5);
          let teamName = team.nom;
          if (teamName.length > 20) {
            teamName = teamName.substring(0, 18) + '...';
          }
          doc.text(teamName, dX, currentY + 4.5, { align: 'center' });

          // Team Manager
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          const teamMgr = team.managerNom || 'Sans manager';
          doc.text(teamMgr, dX, currentY + 7.5, { align: 'center' });

          // Team count
          const teamEmps = this.getOrgTeamEmployees(team.id);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(5.5);
          doc.setTextColor(r, g, b);
          doc.text(`${teamEmps.length} membres`, dX, currentY + 10.2, { align: 'center' });

          currentY += teamH;
        });
      });
    }

    doc.save(`organigramme-${this.entrepriseNom.toLowerCase().replace(/\s+/g, '-')}.pdf`);
    this.toastService.success('Organigramme exporté au format PDF');
  }
}
