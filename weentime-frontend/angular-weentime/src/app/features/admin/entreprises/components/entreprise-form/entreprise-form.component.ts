import { Component, Input, Output, EventEmitter, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { Entreprise, EntrepriseService, EntrepriseRequest } from '../../entreprise.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-entreprise-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './entreprise-form.component.html',
  styleUrl: './entreprise-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EntrepriseFormComponent implements OnInit {
  @Input() entreprise: Entreprise | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() saved = new EventEmitter<void>();

  private fb = inject(FormBuilder);
  private entrepriseService = inject(EntrepriseService);
  private toastService = inject(ToastService);

  form!: FormGroup;
  isSubmitting = signal(false);

  ngOnInit() {
    this.initForm();
  }

  private initForm() {
    this.form = this.fb.group({
      nom: [this.entreprise?.nom || '', [Validators.required, Validators.minLength(2)]],
      siret: [this.entreprise?.siret || '', [Validators.required, Validators.pattern(/^\d{14}$/)]],
      secteur: [this.entreprise?.secteur || '', [Validators.required]],
      email: [this.entreprise?.email || '', [Validators.email]],
      telephone: [this.entreprise?.telephone || '', [Validators.pattern(/^\+?[0-9\s\-]{8,}$/)]],
      siteWeb: [this.entreprise?.siteWeb || '', [Validators.pattern(/^https?:\/\/.+/)]],
      adresse: [this.entreprise?.adresse || '']
    });

    if (this.entreprise) {
      this.form.get('siret')?.disable(); // SIRET generally shouldn't change
    }
  }

  onSubmit() {
    if (this.form.invalid) return;

    this.isSubmitting.set(true);
    const data: EntrepriseRequest = this.form.getRawValue();

    const request = this.entreprise 
      ? this.entrepriseService.updateEntreprise(this.entreprise.id, data)
      : this.entrepriseService.createEntreprise(data);

    request.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toastService.success(this.entreprise ? 'Entreprise mise à jour' : 'Entreprise créée');
        this.saved.emit();
      },
      error: (err: any) => {
        this.isSubmitting.set(false);
        this.toastService.error(err.error?.message || 'Une erreur est survenue');
      }
    });
  }
}
