import { Component, inject, signal, output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AbsenceService } from '../../absence.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { ABSENCE_TYPES, TypeAbsenceConfig, calcDureeJours } from '../../absence.models';

/** Map temporaire : code type → ID backend (à aligner avec vos données) */
const TYPE_ID_MAP: Record<string, number> = {
  MALADIE:             1,
  ACCIDENT_TRAVAIL:    2,
  RAISON_PERSONNELLE:  3,
  FORCE_MAJEURE:       4,
  ABSENCE_INJUSTIFIEE: 5
};

@Component({
  selector: 'app-rh-absence-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './absence-form.component.html',
  styleUrls: ['./absence-form.component.scss']
})
export class RhAbsenceFormComponent {
  private fb             = inject(FormBuilder);
  private absenceService = inject(AbsenceService);
  private toast          = inject(ToastService);

  close = output<void>();
  saved = output<void>();

  readonly absenceTypes: TypeAbsenceConfig[] = ABSENCE_TYPES;

  selectedType = signal<TypeAbsenceConfig | null>(null);
  submitting   = signal(false);

  form = this.fb.nonNullable.group({
    dateDebut: ['', Validators.required],
    dateFin:   ['', Validators.required],
    motif:     ['', [Validators.minLength(10)]]
  });

  dureeJours(): number {
    const v = this.form.getRawValue();
    if (!v.dateDebut || !v.dateFin) return 0;
    return calcDureeJours(v.dateDebut, v.dateFin);
  }

  canSubmit(): boolean {
    const type = this.selectedType();
    return !!type && this.form.valid && this.dureeJours() > 0;
  }

  selectType(type: TypeAbsenceConfig): void {
    this.selectedType.set(type);
  }

  onSubmit(): void {
    const type = this.selectedType();
    if (!type || !this.canSubmit() || this.submitting()) return;

    const v = this.form.getRawValue();
    this.submitting.set(true);

    this.absenceService.declarer({
      typeAbsenceId: TYPE_ID_MAP[type.code] ?? 1,
      dateDebut:     v.dateDebut,
      dateFin:       v.dateFin,
      motif:         v.motif || undefined
    }).subscribe({
      next: () => {
        this.toast.success('Absence enregistrée avec succès.');
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.toast.error(err?.error?.message ?? 'Erreur lors de l\'enregistrement.');
        this.submitting.set(false);
      }
    });
  }
}
