import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService, AdminDepartement, AdminEntreprise } from '../admin-api.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-admin-departements',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <section class="hero"><div><h1>Departements</h1><p>Organisation par entreprise.</p></div><button class="primary" (click)="openCreate()">Nouveau departement</button></section>
      <section class="card">
        <div *ngIf="isLoading()" class="empty">Chargement...</div>
        <div *ngIf="!isLoading() && departements().length === 0" class="empty">Aucun departement disponible.</div>
        <table *ngIf="!isLoading() && departements().length > 0">
          <thead><tr><th>Nom</th><th>Entreprise</th><th>Code</th><th>Equipes</th><th>Utilisateurs</th><th></th></tr></thead>
          <tbody>
            <tr *ngFor="let departement of departements()">
              <td>{{ departement.nom }}</td><td>{{ departement.entrepriseNom || '-' }}</td><td>{{ departement.codeInterne }}</td><td>{{ departement.nombreEquipes }}</td><td>{{ departement.nombreUtilisateurs }}</td>
              <td class="actions"><button (click)="openEdit(departement)">Modifier</button><button class="danger" (click)="remove(departement)">Supprimer</button></td>
            </tr>
          </tbody>
        </table>
      </section>
      <div *ngIf="showForm()" class="backdrop" (click)="closeForm()"></div>
      <section *ngIf="showForm()" class="modal">
        <h2>{{ editingDepartement() ? 'Modifier departement' : 'Creer departement' }}</h2>
        <form [formGroup]="form" (ngSubmit)="save()">
          <label><span>Nom</span><input formControlName="nom" /></label>
          <label><span>Description</span><input formControlName="description" /></label>
          <label><span>Code interne</span><input formControlName="codeInterne" /></label>
          <label><span>Entreprise</span><select formControlName="entrepriseId"><option *ngFor="let entreprise of entreprises()" [ngValue]="entreprise.id">{{ entreprise.nom }}</option></select></label>
          <div class="actions"><button type="button" (click)="closeForm()">Annuler</button><button class="primary" type="submit" [disabled]="isSaving()">Enregistrer</button></div>
        </form>
      </section>
    </div>
  `,
  styles: [`.page{display:grid;gap:16px}.hero,.card,.modal{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:20px}:host-context(.dark) .hero,:host-context(.dark) .card,:host-context(.dark) .modal{background:#111827;border-color:#1f2937}.hero,.actions{display:flex;justify-content:space-between;gap:12px;align-items:center}table{width:100%;border-collapse:collapse}th,td{padding:12px 8px;border-top:1px solid #e2e8f0;text-align:left}.backdrop{position:fixed;inset:0;background:rgba(15,23,42,.45)}.modal{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));z-index:50;display:grid;gap:12px}label{display:grid;gap:6px}input,select{padding:10px 12px;border:1px solid #cbd5e1;border-radius:12px}.primary{background:#2563eb;color:#fff}.danger{background:#fee2e2;color:#991b1b}button{border:none;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer}.empty{padding:24px;text-align:center;color:#64748b}`]
})
export class AdminDepartementsComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly isSaving = signal(false);
  readonly departements = signal<AdminDepartement[]>([]);
  readonly entreprises = signal<AdminEntreprise[]>([]);
  readonly showForm = signal(false);
  readonly editingDepartement = signal<AdminDepartement | null>(null);

  readonly form = this.fb.group({
    nom: ['', Validators.required],
    description: [''],
    codeInterne: ['', Validators.required],
    entrepriseId: [null as number | null, Validators.required]
  });

  constructor() { this.load(); }

  load(): void {
    this.isLoading.set(true);
    forkJoin({
      departements: this.api.getDepartements(0, 200),
      entreprises: this.api.getEntreprises(0, 200)
    }).pipe(finalize(() => this.isLoading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ departements, entreprises }) => {
        this.departements.set(departements.content);
        this.entreprises.set(entreprises.content);
      },
      error: () => this.toast.error('Erreur lors du chargement des departements')
    });
  }

  openCreate(): void { this.editingDepartement.set(null); this.form.reset({ nom: '', description: '', codeInterne: '', entrepriseId: this.entreprises()[0]?.id ?? null }); this.showForm.set(true); }
  openEdit(departement: AdminDepartement): void { this.editingDepartement.set(departement); this.form.reset({ nom: departement.nom, description: departement.description || '', codeInterne: departement.codeInterne, entrepriseId: departement.entrepriseId ?? null }); this.showForm.set(true); }
  closeForm(): void { this.showForm.set(false); }

  save(): void {
    if (this.form.invalid) { this.toast.error('Formulaire departement invalide'); return; }
    this.isSaving.set(true);
    const payload = this.form.getRawValue() as { nom: string; description?: string; codeInterne: string; entrepriseId: number };
    const request$ = this.editingDepartement()
      ? this.api.updateDepartement(this.editingDepartement()!.id, payload)
      : this.api.createDepartement(payload);
    request$.pipe(finalize(() => this.isSaving.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.toast.success('Departement enregistre'); this.closeForm(); this.load(); },
      error: () => this.toast.error('Erreur lors de l enregistrement du departement')
    });
  }

  remove(departement: AdminDepartement): void {
    if (!confirm(`Supprimer ${departement.nom} ?`)) return;
    this.api.deleteDepartement(departement.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => { this.toast.success('Departement supprime'); this.load(); },
      error: () => this.toast.error('Erreur lors de la suppression du departement')
    });
  }
}
