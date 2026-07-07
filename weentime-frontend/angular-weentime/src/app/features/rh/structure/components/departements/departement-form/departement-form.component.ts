import { Component, Input, Output, EventEmitter, inject, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { StructureService } from '../../../structure.service';
import { Departement, CreateDepartementRequest } from '../../../models/structure.model';
import { ToastService } from '../../../../../../core/services/toast.service';

@Component({
  selector: 'app-departement-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './departement-form.component.html',
  styleUrl: './departement-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DepartementFormComponent implements OnInit {
  @Input() departement: Departement | null = null;
  @Input() embedded = false;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private structureService = inject(StructureService);
  private toastService = inject(ToastService);

  form!: FormGroup;
  isSubmitting = signal(false);

  ngOnInit(): void {
    this.form = this.fb.group({
      nom: [this.departement?.nom ?? '', [Validators.required, Validators.minLength(2)]],
      description: [this.departement?.description ?? '']
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.isSubmitting.set(true);
    const data: CreateDepartementRequest = this.form.getRawValue();

    const request = this.departement
      ? this.structureService.updateDepartement(this.departement.id, data)
      : this.structureService.createDepartement(data);

    request.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toastService.success(this.departement ? 'Département modifié' : 'Département créé');
        this.saved.emit();
      },
      error: () => {
        this.isSubmitting.set(false);
        this.toastService.error('Une erreur est survenue');
      }
    });
  }
}
