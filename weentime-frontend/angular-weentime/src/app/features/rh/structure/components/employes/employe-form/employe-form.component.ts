import { Component, Input, Output, EventEmitter, inject, signal, computed, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../../structure.service';
import { CreateEmployeRequest, Departement, EmployeRH, Equipe } from '../../../models/structure.model';
import { ToastService } from '../../../../../../core/services/toast.service';

@Component({
  selector: 'app-employe-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './employe-form.component.html',
  styleUrl: './employe-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeFormComponent implements OnInit {
  @Input() departements: Departement[] = [];
  @Input() equipes: Equipe[] = [];
  @Input() managers: EmployeRH[] = [];
  @Input() title = 'Nouvel employe';
  @Input() submitLabel = 'Creer le collaborateur';
  @Input() defaultRole: 'ROLE_EMPLOYEE' | 'ROLE_MANAGER' = 'ROLE_EMPLOYEE';
  @Input() allowRoleChange = true;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  step = signal<1 | 2>(1);
  form!: FormGroup;
  isSubmitting = signal(false);
  generatedPassword = signal('');

  filteredEquipes = computed(() => {
    const deptId = this.form?.get('departementId')?.value;
    if (!deptId) return [];
    return this.equipes.filter(e => e.departementId === deptId);
  });

  ngOnInit(): void {
    this.form = this.fb.group({
      // Step 1
      prenom: ['', [Validators.required, Validators.minLength(2)]],
      nom: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      telephone: [''],
      poste: ['', [Validators.required]],
      // Step 2
      departementId: [null, [Validators.required]],
      equipeId: [null],
      managerId: [null],
      role: [this.defaultRole, [Validators.required]]
    });

    this.generatePassword();
  }

  generatePassword(): void {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const specials = '@#$%&!?*';

    // Format cible: Wt@2026Xk (10 caractères)
    let pwd = '';
    pwd += upper[Math.floor(Math.random() * upper.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];
    pwd += specials[Math.floor(Math.random() * specials.length)];
    pwd += Math.floor(1000 + Math.random() * 9000).toString(); // 4 digits
    pwd += upper[Math.floor(Math.random() * upper.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)]; // Total 10

    this.generatedPassword.set(pwd);
  }

  copyPassword(): void {
    navigator.clipboard.writeText(this.generatedPassword());
    this.toastService.success('Mot de passe copié');
  }

  isStep1Valid(): boolean {
    const fields = ['prenom', 'nom', 'email', 'poste'];
    return fields.every(f => this.form.get(f)?.valid ?? false);
  }

  goToStep2(): void {
    const fields = ['prenom', 'nom', 'email', 'poste'];
    fields.forEach(f => this.form.get(f)?.markAsTouched());
    if (this.isStep1Valid()) this.step.set(2);
  }

  onDeptChange(): void {
    this.form.get('equipeId')?.setValue(null);
    this.form.get('managerId')?.setValue(null);
  }

  onTeamChange(): void {
    const teamId = this.form.get('equipeId')?.value;
    const team = this.equipes.find(e => e.id === teamId);
    if (team?.managerId && !this.isManagerRole()) {
      this.form.get('managerId')?.setValue(team.managerId);
    }
  }

  onRoleChange(role: 'ROLE_EMPLOYEE' | 'ROLE_MANAGER'): void {
    this.form.get('role')?.setValue(role);
    if (role === 'ROLE_MANAGER') {
      this.form.get('managerId')?.setValue(null);
    }
  }

  isManagerRole(): boolean {
    return this.form?.get('role')?.value === 'ROLE_MANAGER';
  }

  filteredManagers(): EmployeRH[] {
    const equipeId = this.form?.get('equipeId')?.value;
    if (!equipeId) {
      return this.managers;
    }
    return this.managers.filter(manager => !manager.equipeId || manager.equipeId === equipeId);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    const data: CreateEmployeRequest = this.form.getRawValue();

    this.structureService.createEmploye(data).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toastService.success("Employé créé — le code d'invitation de l'entreprise lui a été assigné automatiquement");
        this.saved.emit();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toastService.error('Une erreur est survenue');
      }
    });
  }
}
