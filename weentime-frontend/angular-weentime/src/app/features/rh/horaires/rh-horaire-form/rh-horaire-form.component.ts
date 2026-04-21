import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { HoraireService } from '../../../../core/services/horaire.service';

@Component({
  selector: 'app-rh-horaire-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './rh-horaire-form.component.html',
  styleUrls: ['./rh-horaire-form.component.scss']
})
export class RhHoraireFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly horaireService = inject(HoraireService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  horaireForm!: FormGroup;
  isSubmitting = false;
  isEditMode = false;
  horaireId?: number;
  saveError = '';

  readonly joursSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

  ngOnInit(): void {
    const id = this.route.snapshot.params['id'];
    if (id) {
      this.isEditMode = true;
      this.horaireId = Number(id);
    }

    this.initForm();

    if (this.isEditMode && this.horaireId) {
      this.loadHoraire(this.horaireId);
    }
  }

  initForm(): void {
    this.horaireForm = this.fb.group({
      nom: ['', [Validators.required, Validators.minLength(3)]],
      type: ['FIXE', Validators.required],
      heuresHebdo: [35, [Validators.required, Validators.min(1)]],
      isDefaut: [false],
      statut: ['ACTIF', Validators.required],
      jours: this.fb.array(this.joursSemaine.map(jour => this.createJourForm(jour)))
    });
  }

  loadHoraire(id: number): void {
    this.horaireService.getHoraireById(id).subscribe({
      next: horaire => {
        this.horaireForm.patchValue({
          nom: horaire.nom,
          type: horaire.type,
          heuresHebdo: horaire.heuresHebdo,
          isDefaut: horaire.isDefaut,
          statut: horaire.statut
        });

        horaire.jours.forEach(jour => {
          const index = this.joursSemaine.indexOf(jour.jourSemaine);
          if (index < 0) {
            return;
          }

          const jourForm = this.joursArray.at(index) as FormGroup;
          jourForm.patchValue({
            jourSemaine: jour.jourSemaine,
            estTravaille: jour.estTravaille
          });

          const plagesForm = jourForm.get('plages') as FormArray;
          plagesForm.clear();
          (jour.plages ?? []).forEach(plage => {
            plagesForm.push(this.createPlageForm(plage.type, plage.heureDebut, plage.heureFin));
          });
        });
      },
      error: () => {
        this.saveError = "Impossible de charger l'horaire selectionne.";
      }
    });
  }

  createPlageForm(type = 'TRAVAIL', heureDebut = '', heureFin = ''): FormGroup {
    return this.fb.group({
      type: [type, Validators.required],
      heureDebut: [heureDebut, Validators.required],
      heureFin: [heureFin, Validators.required]
    });
  }

  createJourForm(jour: string): FormGroup {
    const isWeekDay = jour !== 'SAMEDI' && jour !== 'DIMANCHE';
    return this.fb.group({
      jourSemaine: [jour],
      estTravaille: [isWeekDay],
      plages: this.fb.array(isWeekDay ? [this.createPlageForm('TRAVAIL', '08:00', '17:00')] : [])
    }, { validators: this.chevauchementPlagesValidator.bind(this) });
  }

  get joursArray(): FormArray {
    return this.horaireForm.get('jours') as FormArray;
  }

  getPlagesArray(jourIndex: number): FormArray {
    return this.joursArray.at(jourIndex).get('plages') as FormArray;
  }

  addPlage(jourIndex: number): void {
    this.getPlagesArray(jourIndex).push(this.createPlageForm());
  }

  removePlage(jourIndex: number, plageIndex: number): void {
    this.getPlagesArray(jourIndex).removeAt(plageIndex);
  }

  toggleJour(index: number): void {
    const jourGroup = this.joursArray.at(index) as FormGroup;
    const estTravaille = Boolean(jourGroup.get('estTravaille')?.value);
    jourGroup.get('estTravaille')?.setValue(!estTravaille);

    const plagesArray = jourGroup.get('plages') as FormArray;
    if (estTravaille) {
      plagesArray.clear();
      return;
    }

    if (plagesArray.length === 0) {
      plagesArray.push(this.createPlageForm('TRAVAIL', '08:00', '17:00'));
    }
  }

  applyToAll(): void {
    const lundi = this.joursArray.at(0) as FormGroup;
    if (!lundi.get('estTravaille')?.value) {
      return;
    }

    const plagesLundi = this.getPlagesArray(0).getRawValue();
    for (let index = 1; index < 5; index += 1) {
      const currentDay = this.joursArray.at(index) as FormGroup;
      currentDay.patchValue({ estTravaille: true });

      const plagesArray = this.getPlagesArray(index);
      plagesArray.clear();
      plagesLundi.forEach((plage: { type: string; heureDebut: string; heureFin: string }) => {
        plagesArray.push(this.createPlageForm(plage.type, plage.heureDebut, plage.heureFin));
      });
    }
  }

  goBack(): void {
    this.router.navigate(['/app/rh/horaires']);
  }

  chevauchementPlagesValidator(jourControl: AbstractControl): ValidationErrors | null {
    const plages = (jourControl.get('plages') as FormArray)?.value ?? [];
    if (plages.length < 2) {
      return null;
    }

    const sorted = [...plages]
      .filter((plage: { heureDebut?: string; heureFin?: string }) => plage.heureDebut && plage.heureFin)
      .sort((left: { heureDebut: string }, right: { heureDebut: string }) => left.heureDebut.localeCompare(right.heureDebut));

    for (let index = 0; index < sorted.length - 1; index += 1) {
      const plageCourante = sorted[index];
      const plageSuivante = sorted[index + 1];
      if (this.toMinutes(plageCourante.heureFin) > this.toMinutes(plageSuivante.heureDebut)) {
        return {
          chevauchement: {
            plage1: `${plageCourante.heureDebut}-${plageCourante.heureFin}`,
            plage2: `${plageSuivante.heureDebut}-${plageSuivante.heureFin}`
          }
        };
      }
    }

    return null;
  }

  get hasPlagesChevauchement(): boolean {
    return this.joursArray.controls.some(control => control.errors?.['chevauchement']);
  }

  onSubmit(): void {
    this.saveError = '';

    if (this.horaireForm.invalid || this.hasPlagesChevauchement) {
      this.horaireForm.markAllAsTouched();
      this.saveError = this.hasPlagesChevauchement
        ? 'Des plages horaires se chevauchent encore. Corrigez-les avant de continuer.'
        : 'Le formulaire contient des champs obligatoires manquants ou invalides.';
      return;
    }

    this.isSubmitting = true;

    const formValue = this.horaireForm.getRawValue();
    const payload = {
      ...formValue,
      jours: formValue.jours.map((jour: { estTravaille: boolean; plages: Array<{ heureDebut?: string }> }) => ({
        ...jour,
        plages: jour.estTravaille ? this.assignerOrdres(jour.plages) : []
      }))
    };

    const request = this.isEditMode && this.horaireId
      ? this.horaireService.updateHoraire(this.horaireId, payload)
      : this.horaireService.createHoraire(payload);

    request.subscribe({
      next: () => {
        this.isSubmitting = false;
        this.router.navigate(['/app/rh/horaires']);
      },
      error: () => {
        this.isSubmitting = false;
        this.saveError = "Une erreur est survenue pendant l'enregistrement de l'horaire.";
      }
    });
  }

  get totalHeuresCalculees(): number {
    let totalMinutes = 0;

    this.joursArray.controls.forEach(jourCtrl => {
      if (!jourCtrl.get('estTravaille')?.value) {
        return;
      }

      const plages = jourCtrl.get('plages') as FormArray;
      plages.controls.forEach(plageCtrl => {
        if (plageCtrl.get('type')?.value !== 'TRAVAIL') {
          return;
        }

        const debut = plageCtrl.get('heureDebut')?.value;
        const fin = plageCtrl.get('heureFin')?.value;
        if (!debut || !fin) {
          return;
        }

        const [hDebut, mDebut] = debut.split(':').map(Number);
        const [hFin, mFin] = fin.split(':').map(Number);
        let diff = (hFin * 60 + mFin) - (hDebut * 60 + mDebut);
        if (diff < 0) {
          diff += 24 * 60;
        }
        totalMinutes += diff;
      });
    });

    return totalMinutes / 60;
  }

  private assignerOrdres(plages: Array<{ heureDebut?: string }>): Array<Record<string, unknown>> {
    return [...plages]
      .sort((left, right) => (left.heureDebut ?? '').localeCompare(right.heureDebut ?? ''))
      .map((plage, index) => ({ ...plage, ordre: index + 1 }));
  }

  private toMinutes(time: string): number {
    if (!time) {
      return 0;
    }

    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + (minutes || 0);
  }
}
