import { Component, inject, signal, output, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AbsenceService } from '../../../../rh/absences/absence.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { ABSENCE_TYPES, TypeAbsenceConfig, calcDureeJours } from '../../../../rh/absences/absence.models';

/** Map temporaire : code type → ID backend */
const TYPE_ID_MAP: Record<string, number> = {
  MALADIE:             1,
  ACCIDENT_TRAVAIL:    2,
  RAISON_PERSONNELLE:  3,
  FORCE_MAJEURE:       4,
  ABSENCE_INJUSTIFIEE: 5
};

@Component({
  selector: 'app-manager-absence-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './manager-absence-form.component.html',
  styleUrls: ['./manager-absence-form.component.scss']
})
export class ManagerAbsenceFormComponent {
  private fb             = inject(FormBuilder);
  private absenceService = inject(AbsenceService);
  private toast          = inject(ToastService);
  private cdr            = inject(ChangeDetectorRef);

  close = output<void>();
  saved = output<void>();

  // Mock: Manager's team members (simplified representation)
  readonly teamMembers = [
    { id: 1, prenom: 'Imed', nom: 'Ghada', initials: 'IG', color: '#6366f1', departement: 'IT' },
    { id: 2, prenom: 'Sara', nom: 'Mimouni', initials: 'SM', color: '#ec4899', departement: 'Design' },
    { id: 3, prenom: 'Fares', nom: 'Yassin', initials: 'FY', color: '#f59e0b', departement: 'Marketing' },
    { id: 6, prenom: 'Nour', nom: 'Ben Ali', initials: 'NB', color: '#06b6d4', departement: 'Sales' }
  ];

  selectedEmployee = signal<any | null>(null);
  selectedType     = signal<TypeAbsenceConfig | null>(null);
  submitting       = signal(false);

  readonly absenceTypes = ABSENCE_TYPES;

  form = this.fb.nonNullable.group({
    dateDebut: ['', Validators.required],
    dateFin:   ['', Validators.required],
    motif:     ['', [Validators.minLength(10), Validators.maxLength(1000)]]
  });

  selectEmployee(emp: any): void {
    this.selectedEmployee.set(emp);
  }

  selectType(type: TypeAbsenceConfig): void {
    this.selectedType.set(type);
  }

  dureeJours(): number {
    const v = this.form.getRawValue();
    if (!v.dateDebut || !v.dateFin) return 0;
    return calcDureeJours(v.dateDebut, v.dateFin);
  }

  canSubmit(): boolean {
    return !!this.selectedEmployee() && !!this.selectedType() && this.form.valid && this.dureeJours() > 0;
  }

  onSubmit(): void {
    const emp = this.selectedEmployee();
    const type = this.selectedType();
    if (!emp || !type || !this.canSubmit() || this.submitting()) return;

    this.submitting.set(true);
    const v = this.form.getRawValue();

    this.absenceService.declarer({
      typeAbsenceId: TYPE_ID_MAP[type.code] ?? 1,
      dateDebut:     v.dateDebut,
      dateFin:       v.dateFin,
      motif:         v.motif || undefined
    }).subscribe({
      next: () => {
        this.toast.success('Absence signalée — transmise au RH pour validation.');
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Erreur lors de la déclaration.');
        this.submitting.set(false);
        this.cdr.markForCheck();
      }
    });
  }
}
