import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule, Pencil, Plus, RefreshCw, Trash2, Building2, Link, Search, Mail, ShieldOff, ShieldCheck, UserCog, MoreVertical } from 'lucide-angular';
import { RhOwnerService } from './rh-owner.service';
import { EntrepriseSelectItem, RhOwner } from './models/rh-owner.model';
import { ToastService } from '../../../core/services/toast.service';

type RhModalMode = 'create' | 'update' | 'assign' | null;

@Component({
  selector: 'app-admin-rh-owner',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './admin-rh-owner.component.html',
  styleUrl: './admin-rh-owner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminRhOwnerComponent {
  private readonly rhOwnerService = inject(RhOwnerService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  // Déclaration de toutes les icônes requises par la nouvelle vue unifiée
  readonly iconRefresh = RefreshCw;
  readonly iconPlus = Plus;
  readonly iconEdit = Pencil;
  readonly iconDelete = Trash2;
  readonly iconAssign = Building2;
  readonly iconLink = Link;
  readonly iconSearch = Search;
  readonly iconMail = Mail;
  readonly iconShieldOff = ShieldOff;
  readonly iconShieldCheck = ShieldCheck;
  readonly iconUserCog = UserCog;
  readonly iconMore = MoreVertical;
  readonly iconBuilding = Building2;

  readonly rhOwners = signal<RhOwner[]>([]);
  readonly entreprises = signal<EntrepriseSelectItem[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly searchQuery = signal('');
  readonly modalMode = signal<RhModalMode>(null);
  readonly selectedRh = signal<RhOwner | null>(null);
  readonly emailUnique = signal(true);
  readonly emailChecking = signal(false);

  // Signal pour suivre quel menu contextuel d'actions est ouvert dans les lignes du tableau
  readonly showMenuId = signal<number | null>(null);

  readonly rhForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: [''],
    entrepriseId: [null as number | null, [Validators.required]],
  });

  readonly assignForm = this.fb.group({
    entrepriseId: [null as number | null, [Validators.required]],
  });

  readonly filteredOwners = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const list = this.rhOwners();
    if (!query) {
      return list;
    }

    return list.filter(owner => {
      const name = this.getDisplayName(owner).toLowerCase();
      const email = String(owner.email ?? '').toLowerCase();
      const entreprise = String(owner.entrepriseNom ?? this.entrepriseNameById(owner.entrepriseId)).toLowerCase();
      const role = String(owner.role ?? '').toLowerCase();
      return name.includes(query) || email.includes(query) || entreprise.includes(query) || role.includes(query);
    });
  });

  constructor() {
    this.loadData();
  }

  loadData(): void {
    this.isLoading.set(true);

    this.rhOwnerService.getRhOwners().subscribe({
      next: (owners) => {
        this.rhOwners.set(owners);
        this.isLoading.set(false);
      },
      error: () => {
        this.rhOwners.set([]);
        this.isLoading.set(false);
        this.toast.error('Erreur lors du chargement des gestionnaires RH');
      }
    });

    this.rhOwnerService.getEntreprisesForSelect().subscribe({
      next: items => this.entreprises.set(Array.isArray(items) ? items : []),
      error: () => this.entreprises.set([])
    });
  }

  refresh(): void {
    this.loadData();
  }

  // --- Gestion du Menu Contextuel d'Actions Rapides ---
  toggleMenu(event: Event, id: number): void {
    event.stopPropagation();
    this.showMenuId.update(curr => curr === id ? null : id);
  }

  // Permet de changer à la volée le statut depuis le menu d'actions (Actif / Désactivé)
  onToggleStatus(event: Event, id: number): void {
    event.stopPropagation();
    this.showMenuId.set(null);

    this.rhOwnerService.toggleRhStatus(id).subscribe({
      next: (updatedOwner) => {
        // Met à jour localement le gestionnaire modifié dans la liste
        this.rhOwners.update(owners =>
          owners.map(o => o.id === id ? { ...o, statut: updatedOwner.statut ?? (o.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF') } : o)
        );
        const newStatut = updatedOwner.statut ?? 'mis à jour';
        this.toast.success(`Statut modifié vers ${newStatut === 'ACTIF' ? 'Actif' : 'Désactivé'}`);
      },
      error: () => this.toast.error('Impossible de modifier le statut')
    });
  }

  // --- Utilitaires de Formatage Visuel (Avatars & Badges) ---
  getInitials(owner: RhOwner): string {
    const displayName = this.getDisplayName(owner);
    if (!displayName) return 'RH';

    const parts = displayName.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  }

  getAvatarColor(name: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#ef4444', '#0ea5e9'];
    if (!name) return colors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  getEntrepriseBadgeColor(entrepriseName: string): string {
    const colors = ['#4f46e5', '#0284c7', '#0d9488', '#ea580c', '#c026d3'];
    if (!entrepriseName || entrepriseName === '-') return '#64748b';
    let hash = 0;
    for (let i = 0; i < entrepriseName.length; i++) {
      hash = entrepriseName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  }

  // Calcule dynamiquement le nombre de gestionnaires actifs pour le header
  getActiveCount(): number {
    return this.rhOwners().filter(rh => rh.statut === 'ACTIF').length;
  }

  // --- Logique Initiale des Modaux et Formulaires ---
  openCreateModal(): void {
    this.modalMode.set('create');
    this.selectedRh.set(null);
    this.emailUnique.set(true);
    this.rhForm.reset({
      name: '',
      email: '',
      password: '',
      entrepriseId: null
    });
    this.applyPasswordValidators();
  }

  openUpdateModal(owner: RhOwner): void {
    this.modalMode.set('update');
    this.selectedRh.set(owner);
    this.emailUnique.set(true);
    this.rhForm.reset({
      name: this.getDisplayName(owner),
      email: owner.email,
      password: '',
      entrepriseId: owner.entrepriseId ?? null
    });
    this.applyPasswordValidators();
  }

  openAssignModal(owner: RhOwner): void {
    this.modalMode.set('assign');
    this.selectedRh.set(owner);
    this.assignForm.reset({ entrepriseId: owner.entrepriseId ?? null });
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.selectedRh.set(null);
    this.isSubmitting.set(false);
    this.emailChecking.set(false);
  }

  deleteRhOwner(owner: RhOwner): void {
    const confirmed = window.confirm(`Supprimer ${this.getDisplayName(owner)} ?`);
    if (!confirmed) {
      return;
    }

    this.rhOwnerService.deleteRhOwner(owner.id).subscribe({
      next: () => {
        this.toast.success('Gestionnaire RH supprimé');
        this.refresh();
      },
      error: () => this.toast.error('Impossible de supprimer ce gestionnaire RH')
    });
  }

  onEmailBlur(): void {
    const email = this.rhForm.controls.email.value?.trim();
    if (!email || this.rhForm.controls.email.invalid) {
      return;
    }

    const excludedUserId = this.modalMode() === 'update' ? this.selectedRh()?.id : undefined;
    this.emailChecking.set(true);
    this.rhOwnerService.checkEmailUnique(email, excludedUserId).subscribe({
      next: isUnique => {
        this.emailUnique.set(isUnique);
        this.emailChecking.set(false);
      },
      error: () => {
        this.emailUnique.set(false);
        this.emailChecking.set(false);
      }
    });
  }

  submitRhForm(): void {
    this.applyPasswordValidators();
    if (this.rhForm.invalid || !this.emailUnique()) {
      this.rhForm.markAllAsTouched();
      return;
    }

    const mode = this.modalMode();
    if (mode !== 'create' && mode !== 'update') {
      return;
    }

    const ownerId = this.selectedRh()?.id;
    const payload = this.buildRhPayload();
    if (!payload) {
      return;
    }

    this.isSubmitting.set(true);
    const request$ = mode === 'create'
      ? this.rhOwnerService.createRhOwner(payload as { name: string; email: string; password: string; entrepriseId: number })
      : this.rhOwnerService.updateRhOwner(ownerId!, payload);

    request$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success(mode === 'create' ? 'Gestionnaire RH créé' : 'Gestionnaire RH mis à jour');
        this.closeModal();
        this.refresh();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toast.error(mode === 'create' ? 'Échec de création du gestionnaire RH' : 'Échec de mise à jour du gestionnaire RH');
      }
    });
  }

  submitAssignForm(): void {
    if (this.assignForm.invalid || !this.selectedRh()) {
      this.assignForm.markAllAsTouched();
      return;
    }

    const entrepriseId = Number(this.assignForm.controls.entrepriseId.value);
    const owner = this.selectedRh();
    if (!owner || !Number.isFinite(entrepriseId) || entrepriseId <= 0) {
      return;
    }

    this.isSubmitting.set(true);
    this.rhOwnerService.assignEntreprise(owner.id, entrepriseId).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success('Entreprise assignée');
        this.closeModal();
        this.refresh();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toast.error("Impossible d'assigner l'entreprise");
      }
    });
  }

  getDisplayName(owner: RhOwner): string {
    const name = String(owner.name ?? '').trim();
    if (name) {
      return name;
    }

    const prenom = String(owner.prenom ?? '').trim();
    const nom = String(owner.nom ?? '').trim();
    return `${prenom} ${nom}`.trim() || owner.email;
  }

  selectedRhName(): string {
    const owner = this.selectedRh();
    return owner ? this.getDisplayName(owner) : '';
  }

  protected entrepriseNameById(id: number | null | undefined): string {
    if (!id) {
      return '-';
    }
    const entreprise = this.entreprises().find(item => item.id === id);
    return entreprise?.nom ?? '-';
  }

  private applyPasswordValidators(): void {
    const passwordControl = this.rhForm.controls.password;
    if (this.modalMode() === 'create') {
      passwordControl.setValidators([Validators.required, Validators.minLength(8)]);
    } else {
      passwordControl.setValidators([Validators.minLength(8)]);
    }
    passwordControl.updateValueAndValidity({ emitEvent: false });
  }

  private buildRhPayload(): { name: string; email: string; password?: string; entrepriseId: number } | null {
    const raw = this.rhForm.getRawValue();
    const name = String(raw.name ?? '').trim();
    const email = String(raw.email ?? '').trim();
    const password = String(raw.password ?? '').trim();
    const entrepriseId = Number(raw.entrepriseId);

    if (!name || !email || !Number.isFinite(entrepriseId) || entrepriseId <= 0) {
      return null;
    }

    if (this.modalMode() === 'create') {
      return { name, email, password, entrepriseId };
    }

    return {
      name,
      email,
      password: password || undefined,
      entrepriseId
    };
  }
}