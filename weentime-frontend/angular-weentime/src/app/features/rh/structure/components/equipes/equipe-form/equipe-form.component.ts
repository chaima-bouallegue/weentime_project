import { Component, Input, Output, EventEmitter, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../../structure.service';
import { Equipe, CreateEquipeRequest, Departement, EmployeRH } from '../../../models/structure.model';
import { ToastService } from '../../../../../../core/services/toast.service';

@Component({
  selector: 'app-equipe-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './equipe-form.component.html',
  styleUrl: './equipe-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EquipeFormComponent implements OnInit {
  @Input() equipe: Equipe | null = null;
  @Input() departements: Departement[] = [];
  @Input() managers: EmployeRH[] = [];
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  form!: FormGroup;
  isSubmitting = signal(false);

  ngOnInit(): void {
    this.form = this.fb.group({
      nom: [this.equipe?.nom ?? '', [Validators.required, Validators.minLength(2)]],
      description: [this.equipe?.description ?? ''],
      departementId: [this.equipe?.departementId ?? null, [Validators.required]],
      managerId: [this.equipe?.managerId ?? null, []]
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    const data: CreateEquipeRequest = this.form.getRawValue();

    const request = this.equipe
      ? this.structureService.updateEquipe(this.equipe.id, data)
      : this.structureService.createEquipe(data);

    request.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toastService.success(this.equipe ? 'Équipe modifiée' : 'Équipe créée');
        this.saved.emit();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toastService.error('Une erreur est survenue');
      }
    });
  }
}
