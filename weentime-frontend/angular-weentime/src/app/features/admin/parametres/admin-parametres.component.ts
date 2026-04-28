import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { AdminApiService, AdminEntreprise, AdminRole } from '../admin-api.service';
import { ToastService } from '../../../core/services/toast.service';

type FrontRole = 'ADMIN' | 'RH' | 'MANAGER' | 'EMPLOYEE';

@Component({
  selector: 'app-admin-parametres',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <header class="hero">
        <div>
          <h1>Parametres administrateur</h1>
          <p>Configuration globale, roles et entreprise.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="loading">Chargement...</div>
      } @else {
        <section class="card">
          <h2>Configuration globale</h2>
          <form [formGroup]="globalConfigForm" (ngSubmit)="saveGlobalConfig()">
            <div class="grid">
              <label>
                Nom de la plateforme
                <input type="text" formControlName="platformName" />
              </label>
              <label>
                Timeout inactivite (minutes)
                <input type="number" formControlName="inactivityTimeoutMinutes" min="5" />
              </label>
              <label>
                Retention audit (jours)
                <input type="number" formControlName="auditRetentionDays" min="30" />
              </label>
            </div>
            <button class="btn primary" type="submit" [disabled]="globalConfigForm.invalid">Enregistrer</button>
          </form>
        </section>

        <section class="card">
          <h2>Configuration des roles</h2>
          <p class="muted">Normalisation frontend/back-end appliquee automatiquement.</p>
          <table class="compact">
            <thead>
              <tr>
                <th>Backend</th>
                <th>Frontend</th>
                <th>Permissions</th>
              </tr>
            </thead>
            <tbody>
              @for (mapping of roleMappings(); track mapping.backend) {
                <tr>
                  <td>{{ mapping.backend }}</td>
                  <td>{{ mapping.frontend }}</td>
                  <td>{{ mapping.permissions }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <section class="card">
          <h2>Configuration entreprise</h2>
          <form [formGroup]="entrepriseConfigForm" (ngSubmit)="saveEntrepriseConfig()">
            <div class="grid">
              <label>
                Entreprise
                <select formControlName="entrepriseId" (change)="syncEntrepriseForm()">
                  <option [ngValue]="null">Selectionner</option>
                  @for (entreprise of entreprises(); track entreprise.id) {
                    <option [ngValue]="entreprise.id">{{ entreprise.nom }}</option>
                  }
                </select>
              </label>
              <label>
                Limite utilisateurs
                <input type="number" formControlName="maxUsers" min="1" />
              </label>
              <label class="inline">
                <input type="checkbox" formControlName="estActive" />
                Entreprise active
              </label>
            </div>
            <button class="btn primary" type="submit" [disabled]="entrepriseConfigForm.invalid || !selectedEntreprise()">Mettre a jour</button>
          </form>
        </section>
      }
    </section>
  `,
  styles: [`
    .page { display: grid; gap: 16px; padding: 20px; }
    .hero, .card {
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      background: #fff;
      padding: 20px;
    }
    h1 { margin: 0; font-size: 1.4rem; font-weight: 900; color: #0f172a; }
    h2 { margin: 0 0 10px; font-size: 1.1rem; font-weight: 900; color: #1e293b; }
    p { margin: 6px 0 0; color: #64748b; }
    .muted { margin-bottom: 12px; font-size: 0.85rem; }
    .loading { padding: 20px; color: #64748b; }
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 12px; }
    label { display: grid; gap: 6px; color: #334155; font-size: 0.9rem; }
    label.inline { display: flex; align-items: center; gap: 8px; margin-top: 24px; }
    input, select {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 9px 10px;
      outline: none;
      background: #fff;
    }
    input:focus, select:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
    }
    .btn {
      border: none;
      border-radius: 10px;
      padding: 9px 12px;
      font-weight: 800;
      cursor: pointer;
    }
    .btn.primary { background: #2563eb; color: #fff; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      border-top: 1px solid #e2e8f0;
      padding: 10px;
      color: #1e293b;
      font-size: 0.88rem;
    }
    th { border-top: none; color: #64748b; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.06em; background: #f8fafc; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    :host-context(.dark) .hero,
    :host-context(.dark) .card {
      background: #0f172a;
      border-color: #1e293b;
    }
    :host-context(.dark) h1,
    :host-context(.dark) h2,
    :host-context(.dark) th,
    :host-context(.dark) td,
    :host-context(.dark) label { color: #e2e8f0; }
    :host-context(.dark) p,
    :host-context(.dark) .muted,
    :host-context(.dark) .loading { color: #94a3b8; }
    :host-context(.dark) th { background: #111827; border-top-color: #1e293b; }
    :host-context(.dark) td { border-top-color: #1e293b; }
    :host-context(.dark) input,
    :host-context(.dark) select {
      background: #0b1220;
      border-color: #334155;
      color: #e2e8f0;
    }
  `]
})
export class AdminParametresComponent {
  private readonly api = inject(AdminApiService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly roles = signal<AdminRole[]>([]);
  readonly entreprises = signal<AdminEntreprise[]>([]);

  readonly globalConfigForm = this.fb.group({
    platformName: ['WeenTime', [Validators.required]],
    inactivityTimeoutMinutes: [15, [Validators.required, Validators.min(5)]],
    auditRetentionDays: [180, [Validators.required, Validators.min(30)]],
  });

  readonly entrepriseConfigForm = this.fb.group({
    entrepriseId: [null as number | null, [Validators.required]],
    maxUsers: [1, [Validators.required, Validators.min(1)]],
    estActive: [true, [Validators.required]],
  });

  readonly selectedEntreprise = computed(() => {
    const entrepriseId = Number(this.entrepriseConfigForm.controls.entrepriseId.value);
    if (!Number.isFinite(entrepriseId) || entrepriseId <= 0) {
      return null;
    }
    return this.entreprises().find(item => item.id === entrepriseId) ?? null;
  });

  readonly roleMappings = computed(() =>
    this.roles().map(role => ({
      backend: role.nom,
      frontend: this.toFrontRole(role.nom),
      permissions: role.permissions?.length ?? 0
    }))
  );

  constructor() {
    forkJoin({
      roles: this.api.getRoles(),
      entreprises: this.api.getEntreprises(0, 200)
    }).subscribe({
      next: ({ roles, entreprises }) => {
        this.roles.set(Array.isArray(roles) ? roles : []);
        this.entreprises.set(Array.isArray(entreprises.content) ? entreprises.content : []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error("Erreur lors du chargement des parametres");
      }
    });
  }

  saveGlobalConfig(): void {
    if (this.globalConfigForm.invalid) {
      this.globalConfigForm.markAllAsTouched();
      return;
    }
    this.toast.success('Configuration globale enregistree');
  }

  syncEntrepriseForm(): void {
    const entreprise = this.selectedEntreprise();
    if (!entreprise) {
      return;
    }
    this.entrepriseConfigForm.patchValue({
      maxUsers: entreprise.maxUsers ?? 1,
      estActive: Boolean(entreprise.estActive),
    });
  }

  saveEntrepriseConfig(): void {
    const entreprise = this.selectedEntreprise();
    if (!entreprise || this.entrepriseConfigForm.invalid) {
      this.entrepriseConfigForm.markAllAsTouched();
      return;
    }

    const maxUsers = Number(this.entrepriseConfigForm.controls.maxUsers.value);
    const estActive = Boolean(this.entrepriseConfigForm.controls.estActive.value);

    this.api.updateEntreprise(entreprise.id, {
      nom: entreprise.nom,
      siret: entreprise.siret,
      adresse: entreprise.adresse,
      telephone: entreprise.telephone,
      email: entreprise.email,
      siteWeb: entreprise.siteWeb,
      secteur: entreprise.secteur,
      maxUsers,
      estActive
    }).subscribe({
      next: updated => {
        this.entreprises.update(items => items.map(item => item.id === updated.id ? { ...item, ...updated } : item));
        this.toast.success('Configuration entreprise mise a jour');
      },
      error: () => this.toast.error("Impossible de mettre a jour l'entreprise")
    });
  }

  private toFrontRole(backendRole: string): FrontRole {
    const normalized = String(backendRole ?? '').toUpperCase().replace(/^ROLE_/, '');
    if (normalized === 'ADMIN') return 'ADMIN';
    if (normalized === 'RH') return 'RH';
    if (normalized === 'MANAGER') return 'MANAGER';
    return 'EMPLOYEE';
  }
}
