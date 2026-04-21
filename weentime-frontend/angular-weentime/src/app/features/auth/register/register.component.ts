import { Component, inject, signal, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { ThemeService } from '../../../core/services/theme.service';
import { AuthService } from '../../../core/services/auth.service';
import { debounceTime, distinctUntilChanged, Subject, takeUntil, switchMap, map, tap, of, EMPTY, catchError } from 'rxjs';

interface CompanyInfo {
    id?: number;
    name: string;
    industry: string;
    employees: string;
    departments: string[];
}

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule, RouterModule, LucideAngularModule, LogoComponent],
    templateUrl: './register.component.html',
    styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnDestroy {
    private fb = inject(FormBuilder);
    private authService = inject(AuthService);
    private router = inject(Router);
    themeService = inject(ThemeService);

    currentStep = signal(1);
    isLoading = signal(false);
    isSuccess = signal(false);
    apiError = signal<string | null>(null);
    photoPreview = signal<string | null>(null);
    base64Photo = signal<string | null>(null);
    showPassword = signal(false);

    foundCompany = signal<CompanyInfo | null>(null);
    isCodeInvalid = signal(false);
    isCheckingCode = signal(false);

    private destroy$ = new Subject<void>();

    registerForm: FormGroup = this.fb.group({
        step1: this.fb.group({
            companyCode: ['', [Validators.required, Validators.pattern(/^WEEN-[A-Z0-9]{4}$/i)]]
        }),
        step2: this.fb.group({
            firstName: ['', [Validators.required, Validators.minLength(2)]],
            lastName: ['', [Validators.required, Validators.minLength(2)]],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]],
            jobTitle: ['', [Validators.required]],
            department: [''],
            phone: ['']
        }),
        step3: this.fb.group({}), // Photo step is optional
        step4: this.fb.group({
            acceptTerms: [false, [Validators.requiredTrue]]
        })
    });

    onFileChange(event: any) {
        const file = event.target.files[0];
        if (file) {
            if (file.size > 500 * 1024) {
                this.apiError.set("La photo ne doit pas dépasser 500Ko.");
                return;
            }
            this.apiError.set(null);
            const reader = new FileReader();
            reader.onload = () => {
                this.photoPreview.set(reader.result as string);
                this.base64Photo.set(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    }
    departments = signal<string[]>([]);

    stepperSteps = [
        { label: 'Code entreprise', desc: 'Vérification du code' },
        { label: 'Informations', desc: 'Identité & sécurité' },
        { label: 'Identité', desc: 'Vos coordonnées' },
        { label: 'Profil', desc: 'Photo & Social' },
        { label: 'Finalisation', desc: 'Confirmation' }
    ];
    constructor() {
        this.registerForm.get('step1.companyCode')?.valueChanges
            .pipe(
                debounceTime(500),
                map(val => val?.toUpperCase() ?? ''),
                distinctUntilChanged(),
                tap(code => {
                    this.foundCompany.set(null);
                    this.isCodeInvalid.set(false);
                    this.isCheckingCode.set(code.length === 9);
                }),
                switchMap(code =>
                    code.length === 9
                        ? this.authService.validateCompanyCode(code).pipe(
                              catchError(() => {
                                  this.isCodeInvalid.set(true);
                                  this.isCheckingCode.set(false);
                                  return EMPTY;
                              })
                          )
                        : EMPTY
                ),
                takeUntil(this.destroy$)
            )
            .subscribe(res => {
                this.foundCompany.set({
                    id: res.id,
                    name: res.nom,
                    industry: res.secteur,
                    employees: res.collaborateurs.toString(),
                    departments: res.departements || []
                });
                this.departments.set(res.departements || []);
                this.isCheckingCode.set(false);
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }


    getPasswordStrength(): { score: number; label: string; colorClass: string } {
        const pass = this.registerForm.get('step2.password')?.value || '';
        if (!pass) return { score: 0, label: '', colorClass: 'bg-slate-200' };

        let score = 0;
        if (pass.length >= 8) score = 1;
        if (pass.length >= 8 && /[a-z]/.test(pass) && /[A-Z]/.test(pass)) score = 2;
        if (score === 2 && /[0-9]/.test(pass)) score = 3;
        if (score === 3 && /[^a-zA-Z0-9]/.test(pass)) score = 4;

        const labels = ['', 'FAIBLE', 'MOYEN', 'FORT', 'TRÈS FORT'];
        const colors = ['bg-slate-200', 'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-emerald-500'];

        return {
            score,
            label: labels[score] || 'FAIBLE',
            colorClass: colors[score] || 'bg-red-400'
        };
    }

    nextStep() {
        const currentStepGroup = this.registerForm.get(`step${this.currentStep()}`);
        if (!currentStepGroup || currentStepGroup.valid) {
            if (this.currentStep() === 1 && !this.foundCompany()) {
                return;
            }
            this.currentStep.set(this.currentStep() + 1);
        } else {
            currentStepGroup.markAllAsTouched();
        }
    }

    prevStep() {
        if (this.currentStep() > 1) {
            this.currentStep.set(this.currentStep() - 1);
        }
    }

    onSubmit() {
        if (this.registerForm.invalid) {
            this.registerForm.markAllAsTouched();
            return;
        }

        this.isLoading.set(true);
        this.apiError.set(null);

        const formValue = this.registerForm.value;
        const userData = {
            nom: formValue.step2.lastName,
            prenom: formValue.step2.firstName,
            email: formValue.step2.email,
            motDePasse: formValue.step2.password,
            telephone: formValue.step2.phone,
            poste: formValue.step2.jobTitle,
            entrepriseId: this.foundCompany()?.id,
            photo: this.base64Photo()
        };

        this.authService.register(userData).subscribe({
            next: (res) => {
                this.isLoading.set(false);
                this.isSuccess.set(true);
                setTimeout(() => {
                    this.router.navigate(['/login']);
                }, 3000);
            },
            error: (err) => {
                this.isLoading.set(false);
                this.apiError.set(err.error?.message || 'Une erreur est survenue lors de l\'inscription.');
            }
        });
    }

    get f1() { return (this.registerForm.get('step1') as FormGroup).controls; }
    get f2() { return (this.registerForm.get('step2') as FormGroup).controls; }
    get f4() { return (this.registerForm.get('step4') as FormGroup).controls; }

    get step1Valid() { return this.registerForm.get('step1')?.valid && this.foundCompany(); }
    get step2Valid() { return this.registerForm.get('step2')?.valid; }

    isFieldValid(step: number, fieldName: string): boolean {
        const control = this.registerForm.get(`step${step}.${fieldName}`);
        return !!(control && control.touched && control.valid);
    }

    isFieldInvalid(step: number, fieldName: string): boolean {
        const control = this.registerForm.get(`step${step}.${fieldName}`);
        return !!(control && control.touched && control.invalid);
    }

    getInputClass(step: number, fieldName: string): string {
        let classes = 'input-underline';
        if (this.isFieldInvalid(step, fieldName)) {
            classes += ' input-underline-invalid shake-error';
        } else if (this.isFieldValid(step, fieldName)) {
            classes += ' input-underline-valid';
        }
        return classes;
    }
}
