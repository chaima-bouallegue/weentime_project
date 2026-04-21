import {
  Component, inject, signal, computed, output,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { LucideAngularModule } from 'lucide-angular';
import { AbsenceService } from '../../../../rh/absences/absence.service';
import { ToastService } from '../../../../../core/services/toast.service';
import {
  ABSENCE_TYPES, TypeAbsenceConfig, calcDureeJours
} from '../../../../rh/absences/absence.models';

/** Types d'absence mappés vers les IDs backend (à adapter selon vos données) */
const TYPE_ID_MAP: Record<string, number> = {
  MALADIE:             1,
  ACCIDENT_TRAVAIL:    2,
  RAISON_PERSONNELLE:  3,
  FORCE_MAJEURE:       4,
  ABSENCE_INJUSTIFIEE: 5
};

@Component({
  selector: 'app-employe-absence-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './employe-absence-form.component.html',
  styleUrls: ['./employe-absence-form.component.scss']
})
export class EmployeAbsenceFormComponent {
  private fb             = inject(FormBuilder);
  private absenceService = inject(AbsenceService);
  private toast          = inject(ToastService);
  private cdr            = inject(ChangeDetectorRef);

  close = output<void>();
  saved = output<void>();

  // ── Stepper state ──────────────────────────────────────────────────────────
  currentStep = signal<1 | 2 | 3>(1);
  readonly steps = [
    { num: 1, label: "Type d'absence" },
    { num: 2, label: 'Période'        },
    { num: 3, label: 'Justificatif'   }
  ];

  // ── Step 1 — Type d'absence ───────────────────────────────────────────────
  readonly absenceTypes: TypeAbsenceConfig[] = ABSENCE_TYPES;
  selectedType = signal<TypeAbsenceConfig | null>(null);

  // ── Step 2 — Période ─────────────────────────────────────────────────────
  periodeForm = this.fb.nonNullable.group({
    dateDebut: ['', Validators.required],
    dateFin:   ['', Validators.required]
  });

  periodeFormValue = toSignal(this.periodeForm.valueChanges);

  dureeJours = computed(() => {
    const v = this.periodeFormValue();
    if (!v?.dateDebut || !v?.dateFin) return 0;
    return calcDureeJours(v.dateDebut, v.dateFin);
  });

  dateError = signal<string | null>(null);

  // ── Step 3 — Justificatif & Motif ────────────────────────────────────────
  motifForm = this.fb.nonNullable.group({
    motif: ['', [Validators.minLength(10), Validators.maxLength(1000)]]
  });

  uploadedFile     = signal<File | null>(null);
  uploadedPath     = signal<string | null>(null);
  uploadProgress   = signal<'idle' | 'uploading' | 'done' | 'error'>('idle');
  isDragOver       = signal(false);
  submitting       = signal(false);

  motifLength = computed(() => this.motifForm.getRawValue().motif.length);

  // ── Computed ──────────────────────────────────────────────────────────────
  canGoStep2 = computed(() => this.selectedType() !== null);

  canGoStep3 = computed(() => {
    const v = this.periodeFormValue();
    if (!v?.dateDebut || !v?.dateFin) return false;
    if (new Date(v.dateFin) < new Date(v.dateDebut)) return false;
    return this.dureeJours() > 0;
  });

  canSubmit = computed(() => {
    const type  = this.selectedType();
    const motif = this.motifForm.getRawValue().motif;
    if (!type) return false;
    if (type.requireJustificatif && !this.uploadedPath()) return false;
    if (motif && motif.length > 0 && motif.length < 10) return false;
    return true;
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  goToStep(step: 1 | 2 | 3): void {
    this.currentStep.set(step);
  }

  nextStep(): void {
    const step = this.currentStep();
    if (step === 1 && this.canGoStep2()) {
      this.currentStep.set(2);
    } else if (step === 2) {
      this.validatePeriode();
      if (!this.dateError()) this.currentStep.set(3);
    }
  }

  prevStep(): void {
    const step = this.currentStep();
    if (step > 1) this.currentStep.set((step - 1) as 1 | 2 | 3);
  }

  selectType(type: TypeAbsenceConfig): void {
    this.selectedType.set(type);
  }

  // ── Validation période ────────────────────────────────────────────────────
  private validatePeriode(): void {
    const v = this.periodeForm.getRawValue();
    if (!v.dateDebut || !v.dateFin) {
      this.dateError.set('Les deux dates sont obligatoires.');
      return;
    }
    if (new Date(v.dateFin) < new Date(v.dateDebut)) {
      this.dateError.set('La date de fin doit être après la date de début.');
      return;
    }
    this.dateError.set(null);
  }

  // ── Drag & Drop / File pick ───────────────────────────────────────────────
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(): void {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.handleFile(file);
  }

  onFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.handleFile(file);
  }

  private handleFile(file: File): void {
    const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      this.toast.error('Format invalide. Acceptés : PDF, JPG, PNG');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Fichier trop volumineux. Maximum : 5 Mo');
      return;
    }
    
    this.uploadedFile.set(file);
    this.uploadProgress.set('uploading');

    const reader = new FileReader();
    reader.onload = () => {
      this.uploadedPath.set(reader.result as string);
      this.uploadProgress.set('done');
      this.cdr.markForCheck();
    };
    reader.onerror = () => {
      this.uploadProgress.set('error');
      this.toast.error("Échec de la lecture du fichier.");
      this.cdr.markForCheck();
    };
    reader.readAsDataURL(file);
  }

  removeFile(): void {
    this.uploadedFile.set(null);
    this.uploadedPath.set(null);
    this.uploadProgress.set('idle');
  }

  isImageFile(): boolean {
    return this.uploadedFile()?.type?.startsWith('image/') ?? false;
  }

  getFileObjectUrl(): string {
    const f = this.uploadedFile();
    return f ? URL.createObjectURL(f) : '';
  }

  // ── Soumission ────────────────────────────────────────────────────────────
  onSubmit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    const type  = this.selectedType()!;
    const dates = this.periodeForm.getRawValue();
    const motif = this.motifForm.getRawValue().motif;

    this.submitting.set(true);
    this.absenceService.declarer({
      typeAbsenceId:   TYPE_ID_MAP[type.code] ?? 1,
      dateDebut:       dates.dateDebut,
      dateFin:         dates.dateFin,
      motif:           motif || undefined,
      justificatif:    this.uploadedPath() ?? undefined
    }).subscribe({
      next: () => {
        this.toast.success('Déclaration soumise avec succès ! En attente de validation RH.');
        this.submitting.set(false);
        this.saved.emit();
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Erreur lors de la soumission.';
        this.toast.error(msg);
        this.submitting.set(false);
        this.cdr.markForCheck();
      }
    });
  }
}
