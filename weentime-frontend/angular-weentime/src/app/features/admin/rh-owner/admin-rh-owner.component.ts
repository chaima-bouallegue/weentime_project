import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { LucideAngularModule, Pencil, Plus, RefreshCw, Trash2, Building2, Link } from 'lucide-angular';
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

  readonly iconRefresh = RefreshCw;
  readonly iconPlus = Plus;
  readonly iconEdit = Pencil;
  readonly iconDelete = Trash2;
  readonly iconAssign = Building2;
  readonly iconLink = Link;

  readonly rhOwners = signal<RhOwner[]>([]);
  readonly entreprises = signal<EntrepriseSelectItem[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly searchQuery = signal('');
  readonly modalMode = signal<RhModalMode>(null);
  readonly selectedRh = signal<RhOwner | null>(null);
  readonly emailUnique = signal(true);
  readonly emailChecking = signal(false);

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
      const entreprise = String(owner.entrepriseNom ?? '').toLowerCase();
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
        this.toast.success('Gestionnaire RH supprime');
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
        this.toast.success(mode === 'create' ? 'Gestionnaire RH cree' : 'Gestionnaire RH mis a jour');
        this.closeModal();
        this.refresh();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toast.error(mode === 'create' ? 'Echec de creation du gestionnaire RH' : 'Echec de mise a jour du gestionnaire RH');
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
        this.toast.success('Entreprise assignee');
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
