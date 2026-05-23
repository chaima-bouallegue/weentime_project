import { Component, inject, signal, OnDestroy, isDevMode } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { ThemeService } from '../../../core/services/theme.service';
import { AuthService, CompanyCodeValidationResponse } from '../../../core/services/auth.service';
import { debounceTime, distinctUntilChanged, Subject, takeUntil, switchMap, map, tap, of, catchError } from 'rxjs';

interface CompanyInfo {
    id?: number;
    name: string;
    industry: string;
    employees: string;
}

type CompanyCodeErrorReason = 'CODE_NOT_FOUND' | 'ENTERPRISE_CLOSED' | 'ENTERPRISE_FULL' | 'NETWORK_ERROR';

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
    codeErrorMessage = signal<string | null>(null);

    private destroy$ = new Subject<void>();
    private readonly normalizedCompanyCodePattern = /^[A-Z0-9-]{4,40}$/;
    private readonly companyCodeValidator = (control: AbstractControl): ValidationErrors | null => {
        const code = this.normalizeInvitationCode(control.value);
        return !code || this.isValidCompanyCodeFormat(code) ? null : { companyCode: true };
    };

    registerForm: FormGroup = this.fb.group({
        step1: this.fb.group({
            companyCode: ['', [Validators.required, this.companyCodeValidator]]
        }),
        step2: this.fb.group({
            firstName: ['', [Validators.required, Validators.minLength(2)]],
            lastName: ['', [Validators.required, Validators.minLength(2)]],
            email: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]],
            jobTitle: ['', [Validators.required]],
            telephone: ['', [Validators.pattern(/^(\+|00)[0-9\s().-]{8,20}$/)]]
        }),
        step3: this.fb.group({}), // Photo step is optional
        step4: this.fb.group({
            acceptTerms: [false, [Validators.requiredTrue]]
        })
    });

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
                debounceTime(400),
                map(val => this.normalizeInvitationCode(val)),
                distinctUntilChanged(),
                tap(code => {
                    this.foundCompany.set(null);
                    this.isCodeInvalid.set(false);
                    this.codeErrorMessage.set(null);
                    const isValidFormat = this.isValidCompanyCodeFormat(code);
                    this.isCheckingCode.set(isValidFormat);
                }),
                switchMap(code => {
                    return this.isValidCompanyCodeFormat(code)
                        ? this.authService.validateCompanyCode(code).pipe(
                              catchError((error: HttpErrorResponse) => {
                                  this.handleCompanyCodeError(error);
                                  return of(null);
                              })
                          )
                        : of(null);
                }),
                takeUntil(this.destroy$)
            )
            .subscribe(res => {
                if (res?.valid) {
                    this.foundCompany.set(this.toCompanyInfo(res));
                    this.isCodeInvalid.set(false);
                    this.codeErrorMessage.set(null);
                    if (this.currentStep() === 1) {
                        this.currentStep.set(2);
                    }
                } else if (res?.valid === false) {
                    this.isCodeInvalid.set(true);
                    this.codeErrorMessage.set(this.messageForReason(res.reason, res.message));
                }
                this.isCheckingCode.set(false);
            });
    }

    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
    }

    onFileChange(event: any) {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            this.apiError.set("La photo ne doit pas dépasser 5 Mo.");
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            this.apiError.set("Formats acceptés : JPG, PNG, WebP uniquement.");
            return;
        }

        this.apiError.set(null);
        this.isLoading.set(true);

        this.compressImage(file).then(base64 => {
            this.photoPreview.set(base64);
            this.base64Photo.set(base64);
            this.isLoading.set(false);
        }).catch(() => {
            this.isLoading.set(false);
            this.apiError.set("Erreur lors du traitement de l'image.");
        });
    }

    private compressImage(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (e: any) => {
                const img = new Image();
                img.src = e.target?.result as string;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    const MAX_SIZE = 800;
                    if (width > height) {
                        if (width > MAX_SIZE) {
                            height *= MAX_SIZE / width;
                            width = MAX_SIZE;
                        }
                    } else {
                        if (height > MAX_SIZE) {
                            width *= MAX_SIZE / height;
                            height = MAX_SIZE;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, width, height);

                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    resolve(compressedBase64);
                };
                img.onerror = (err) => reject(err);
            };
            reader.onerror = (err) => reject(err);
        });
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
        if (this.isLoading()) {
            return;
        }

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
            telephone: this.normalizePhoneNumber(formValue.step2.telephone),
            poste: formValue.step2.jobTitle,
            entrepriseId: this.foundCompany()?.id,
            photo: this.base64Photo()
        };

        this.authService.register(userData).subscribe({
            next: () => {
                this.isLoading.set(false);
                this.isSuccess.set(true);
                setTimeout(() => {
                    this.router.navigate(['/login']);
                }, 3000);
            },
            error: (err) => {
                this.isLoading.set(false);
                const errorBody = err.error;
                const message = err.status === 0
                    ? this.messageForReason('NETWORK_ERROR')
                    : errorBody?.details || errorBody?.message || 'Une erreur est survenue lors de l\'inscription.';
                if (isDevMode()) {
                    console.warn('[Register] Registration failed', {
                        status: err.status,
                        reason: errorBody?.reason || errorBody?.error
                    });
                }
                this.apiError.set(message);
            }
        });
    }

    get f1() { return (this.registerForm.get('step1') as FormGroup).controls; }
    get f2() { return (this.registerForm.get('step2') as FormGroup).controls; }
    get f4() { return (this.registerForm.get('step4') as FormGroup).controls; }

    get step1Valid() { return !!(this.registerForm.get('step1')?.valid && this.foundCompany() && !this.isCheckingCode()); }
    get step2Valid() { return this.registerForm.get('step2')?.valid; }

    isFieldValid(step: number, fieldName: string): boolean {
        const control = this.registerForm.get(`step${step}.${fieldName}`);
        return !!(control && control.touched && control.valid);
    }

    isFieldInvalid(step: number, fieldName: string): boolean {
        const control = this.registerForm.get(`step${step}.${fieldName}`);
        return !!(control && (control.touched || control.dirty) && control.invalid);
    }

    getInputClass(step: number, fieldName: string): string {
        let classes = '';
        if (this.isFieldInvalid(step, fieldName)) {
            classes = 'input-error shake-error';
        } else if (this.isFieldValid(step, fieldName)) {
            classes = 'input-valid';
        }
        return classes;
    }

    private normalizeInvitationCode(value: unknown): string {
        const normalized = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
        const withoutHash = normalized.replace(/^#+/, '');
        return withoutHash.startsWith('N-') ? `WEEN-${withoutHash.substring(2)}` : withoutHash;
    }

    private normalizePhoneNumber(value: unknown): string | undefined {
        const raw = String(value ?? '').trim();
        if (!raw) {
            return undefined;
        }
        let normalized = raw.replace(/[\s().-]+/g, '');
        if (normalized.startsWith('00')) {
            normalized = `+${normalized.substring(2)}`;
        }
        return normalized;
    }

    private isValidCompanyCodeFormat(code: string): boolean {
        return this.normalizedCompanyCodePattern.test(code);
    }

    private toCompanyInfo(response: CompanyCodeValidationResponse): CompanyInfo {
        return {
            id: response.enterpriseId ?? response.id,
            name: response.enterpriseName ?? response.nom ?? '',
            industry: response.secteur ?? '',
            employees: String(response.collaborateurs ?? '')
        };
    }

    private handleCompanyCodeError(error: HttpErrorResponse): void {
        const errorBody = error.error;
        const reason = this.resolveCompanyCodeErrorReason(error);

        this.isCodeInvalid.set(true);
        this.isCheckingCode.set(false);
        this.codeErrorMessage.set(this.messageForReason(reason, errorBody?.message || errorBody?.details));

        if (isDevMode()) {
            console.warn('[Register] Invitation code validation failed', {
                status: error.status,
                reason,
                message: errorBody?.message || errorBody?.details
            });
        }
    }

    private resolveCompanyCodeErrorReason(error: HttpErrorResponse): CompanyCodeErrorReason {
        if (error.status === 0) {
            return 'NETWORK_ERROR';
        }

        const errorBody = error.error;
        const reason = errorBody?.reason || errorBody?.error;
        if (reason === 'ENTERPRISE_CLOSED' || reason === 'ENTERPRISE_FULL' || reason === 'CODE_NOT_FOUND') {
            return reason;
        }

        return error.status === 409 ? 'ENTERPRISE_CLOSED' : 'CODE_NOT_FOUND';
    }

    private messageForReason(reason: unknown, fallbackMessage?: string): string {
        switch (reason as CompanyCodeErrorReason) {
            case 'ENTERPRISE_CLOSED':
                return 'Cette entreprise est fermée. Contactez votre administrateur.';
            case 'NETWORK_ERROR':
                return 'Service indisponible. Réessayez plus tard.';
            case 'ENTERPRISE_FULL':
                return fallbackMessage || "Code d'invitation invalide ou expiré.";
            case 'CODE_NOT_FOUND':
                return "Code d'invitation invalide ou expiré.";
            default:
                return fallbackMessage || "Code d'invitation invalide ou expiré.";
        }
    }
}
