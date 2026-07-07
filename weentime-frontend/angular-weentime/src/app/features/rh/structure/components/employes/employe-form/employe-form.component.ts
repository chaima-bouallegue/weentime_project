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
  @Input() pendingUser: EmployeRH | null = null;
  @Input() isValidationMode = false;
  @Input() employee: EmployeRH | null = null;
  /** When true, rendered inside CDK overlay — no own .drawer-overlay wrapper */
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();
  @Output() validate = new EventEmitter<{id: number, request: any}>();

  private fb = inject(FormBuilder);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  step = signal<1 | 2>(1);
  form!: FormGroup;
  isSubmitting = signal(false);
  generatedPassword = signal('');

  selectedDeptId = signal<number | null>(null);

  filteredEquipes = computed(() => {
    const deptId = this.selectedDeptId();
    if (!deptId) return [];
    const deptIdNum = Number(deptId);
    return this.equipes.filter(e => e.departementId === deptIdNum);
  });

  ngOnInit(): void {
    this.form = this.fb.group({
      // Step 1
      prenom: [{ value: '', disabled: this.isValidationMode }, [Validators.required, Validators.minLength(2)]],
      nom: [{ value: '', disabled: this.isValidationMode }, [Validators.required, Validators.minLength(2)]],
      email: [{ value: '', disabled: this.isValidationMode }, [Validators.required, Validators.email]],
      telephone: [{ value: '', disabled: this.isValidationMode }],
      poste: [{ value: '', disabled: this.isValidationMode }, [Validators.required]],
      // Step 2
      departementId: [null, [Validators.required]],
      equipeId: [null],
      managerId: [null],
      role: [this.defaultRole, [Validators.required]]
    });

    if (this.employee) {
      this.form.patchValue({
        prenom: this.employee.prenom,
        nom: this.employee.nom,
        email: this.employee.email,
        telephone: this.employee.telephone || '',
        poste: this.employee.poste,
        departementId: this.employee.departementId,
        equipeId: this.employee.equipeId || null,
        managerId: this.employee['managerId'] || null,
        role: this.employee.role || 'ROLE_EMPLOYEE'
      });
      this.selectedDeptId.set(this.employee.departementId);
    } else if (this.isValidationMode && this.pendingUser) {
      this.form.patchValue({
        prenom: this.pendingUser.prenom,
        nom: this.pendingUser.nom,
        email: this.pendingUser.email,
        telephone: this.pendingUser.telephone,
        poste: this.pendingUser.poste
      });
      this.step.set(2); // Skip to assignment step
    }

    if (!this.isValidationMode && !this.employee) {
      this.generatePassword();
    }
  }

  generatePassword(): void {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';
    const specials = '@#$%&!?*';

    let pwd = '';
    pwd += upper[Math.floor(Math.random() * upper.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];
    pwd += specials[Math.floor(Math.random() * specials.length)];
    pwd += Math.floor(1000 + Math.random() * 9000).toString();
    pwd += upper[Math.floor(Math.random() * upper.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];
    pwd += letters[Math.floor(Math.random() * letters.length)];

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
    const deptId = this.form.get('departementId')?.value;
    this.selectedDeptId.set(deptId);
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

    if (this.isValidationMode && this.pendingUser) {
      const validationData = {
        departementId: this.form.get('departementId')?.value,
        equipeId: this.form.get('equipeId')?.value,
        role: this.form.get('role')?.value
      };
      this.validate.emit({ id: this.pendingUser.id, request: validationData });
      return;
    }

    const rawData = this.form.getRawValue();

    if (this.employee) {
      this.structureService.updateEmploye(this.employee.id, rawData).subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.toastService.success('Collaborateur mis à jour');
          this.saved.emit();
        },
        error: () => {
          this.isSubmitting.set(false);
          this.toastService.error('Une erreur est survenue lors de la mise à jour');
        }
      });
      return;
    }

    const data: CreateEmployeRequest = {
      ...rawData,
      password: this.generatedPassword()
    };

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
