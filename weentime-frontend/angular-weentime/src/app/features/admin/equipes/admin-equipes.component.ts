import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService, AdminDepartement, AdminEquipe, AdminUser } from '../admin-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-equipes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <section class="hero"><div><h1>Equipes</h1><p>Structure des equipes et responsables.</p></div><button class="primary" (click)="openCreate()">Nouvelle equipe</button></section>
      <section class="card">
        <div *ngIf="isLoading()" class="empty">Chargement...</div>
        <div *ngIf="!isLoading() && equipes().length === 0" class="empty">Aucune equipe disponible.</div>
        <table *ngIf="!isLoading() && equipes().length > 0">
          <thead><tr><th>Nom</th><th>Departement</th><th>Entreprise</th><th>Capacite</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let equipe of equipes()">
              <td>{{ equipe.nom }}</td><td>{{ equipe.departementNom || '-' }}</td><td>{{ equipe.entrepriseNom || '-' }}</td><td>{{ equipe.effectifMaximum || '-' }}</td><td>{{ equipe.estActive ? 'Active' : 'Inactive' }}</td>
              <td class="actions"><button (click)="openEdit(equipe)">Modifier</button><button class="danger" (click)="remove(equipe)">Supprimer</button></td>
            </tr>
          </tbody>
        </table>
      </section>
      <div *ngIf="showForm()" class="backdrop" (click)="closeForm()"></div>
      <section *ngIf="showForm()" class="modal">
        <h2>{{ editingEquipe() ? 'Modifier equipe' : 'Creer equipe' }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()">
          <label><span>Nom</span><input formControlName="nom" /></label>
          <label><span>Description</span><input formControlName="description" /></label>
          <label><span>Departement</span><select formControlName="departementId"><option *ngFor="let departement of departements()" [ngValue]="departement.id">{{ departement.nom }}</option></select></label>
          <label><span>Responsable</span><select formControlName="responsableId"><option [ngValue]="null">Aucun</option><option *ngFor="let manager of managers()" [ngValue]="manager.id">{{ manager.prenom }} {{ manager.nom }}</option></select></label>
          <label><span>Effectif maximum</span><input type="number" formControlName="effectifMaximum" min="1" /></label>
          <label class="checkbox"><input type="checkbox" formControlName="estActive" /><span>Equipe active</span></label>
          <div class="actions"><button type="button" (click)="closeForm()">Annuler</button><button class="primary" type="submit" [disabled]="isSaving()">Enregistrer</button></div>
        </form>
      </section>
    </div>
  `,
  styles: [`.page{display:grid;gap:16px}.hero,.card,.modal{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:20px}:host-context(.dark) .hero,:host-context(.dark) .card,:host-context(.dark) .modal{background:#111827;border-color:#1f2937}.hero,.actions{display:flex;justify-content:space-between;gap:12px;align-items:center}table{width:100%;border-collapse:collapse}th,td{padding:12px 8px;border-top:1px solid #e2e8f0;text-align:left}.backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45)}.modal{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));z-index:50;display:grid;gap:12px}label{display:grid;gap:6px}input,select{padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px}.primary{background:#2563eb;color:#fff}.danger{background:#fee2e2;color:#991b1b}button{border:none;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer}.empty{padding:24px;text-align:center;color:#64748b}.checkbox{display:flex;align-items:center;gap:10px}`]
})
export class AdminEquipesComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly equipes = signal<AdminEquipe[]>([]);
  readonly departements = signal<AdminDepartement[]>([]);
  readonly managers = signal<AdminUser[]>([]);
  readonly showForm = signal(false);
  readonly editingEquipe = signal<AdminEquipe | null>(null);

  readonly form = this.fb.group({
    nom: ['', Validators.required],
    description: [''],
    responsableId: [null as number | null],
    effectifMaximum: [null as number | null],
    estActive: [true, Validators.required],
    departementId: [null as number | null, Validators.required]
  });

  constructor() { this.load(); }

  load(): void {
    this.isLoading.set(true);
    forkJoin({
      equipes: this.api.getEquipes(0, 200),
      departements: this.api.getDepartements(0, 200),
      users: this.api.getUsers(0, 200)
    }).pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ equipes, departements, users }) => {
        this.equipes.set(equipes.content);
        this.departements.set(departements.content);
        this.managers.set(users.content.filter(user => user.roles.some(role => role.nom === 'ROLE_MANAGER')));
      },
      error: () => this.toast.error('Erreur lors du chargement des equipes')
    });
  }

  openCreate(): void { this.editingEquipe.set(null); this.form.reset({ nom: '', description: '', responsableId: null, effectifMaximum: null, estActive: true, departementId: this.departements()[0]?.id ?? null }); this.showForm.set(true); }
  openEdit(equipe: AdminEquipe): void { this.editingEquipe.set(equipe); this.form.reset({ nom: equipe.nom, description: equipe.description || '', responsableId: equipe.responsableId ?? null, effectifMaximum: equipe.effectifMaximum ?? null, estActive: equipe.estActive, departementId: equipe.departementId }); this.showForm.set(true); }
  closeForm(): void { this.showForm.set(false); }

  save(): void {
    if (this.form.invalid) { this.toast.error('Formulaire equipe invalide'); return; }
    this.isSaving.set(true);
    const payload = this.form.getRawValue() as { nom: string; description?: string; responsableId?: number | null; effectifMaximum?: number | null; estActive: boolean; departementId: number };
    const request$ = this.editingEquipe()
      ? this.api.updateEquipe(this.editingEquipe()!.id, payload)
      : this.api.createEquipe(payload);
    request$.pipe(finalize(() => this.isSaving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.toast.success('Equipe enregistree'); this.closeForm(); this.load(); },
      error: () => this.toast.error('Erreur lors de l enregistrement equipe')
    });
  }

  remove(equipe: AdminEquipe): void {
    if (!confirm(`Supprimer ${equipe.nom} ?`)) return;
    this.api.deleteEquipe(equipe.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.toast.success('Equipe supprimee'); this.load(); },
      error: () => this.toast.error('Erreur lors de la suppression equipe')
    });
  }
}
