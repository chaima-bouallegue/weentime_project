import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RecrutementService, JobPosting } from '../../../../features/rh/recrutement/services/recrutement.service';
import { LucideAngularModule, ChevronLeft, Upload, Send, CheckCircle2, FileText, X } from 'lucide-angular';

@Component({
  selector: 'app-apply',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-950 p-6 pt-24 lg:pt-32">
      <div class="max-w-3xl mx-auto space-y-8 animate-fade-in">
        
        <!-- Header -->
        <div class="flex items-center gap-4">
           <a routerLink="/careers" class="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all shadow-sm border border-slate-200 dark:border-slate-800">
             <i-lucide [img]="ChevronLeft" class="w-6 h-6"></i-lucide>
           </a>
            <div *ngIf="job() as j">
              <h1 class="text-2xl font-bold text-slate-900 dark:text-white">{{j.title}}</h1>
              <p class="text-sm text-violet-600 font-bold" *ngIf="j.entrepriseName">{{j.entrepriseName}}</p>
              <p class="text-xs text-slate-500">{{j.location}} • {{j.employmentType}}</p>
            </div>
        </div>

        <div *ngIf="!submitted(); else successTemplate" class="bg-white dark:bg-slate-900 rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
           <form [formGroup]="applyForm" (ngSubmit)="onSubmit()" class="space-y-6">
              
              <!-- Personal Info -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div class="space-y-2">
                    <label class="text-sm font-bold text-slate-700 dark:text-slate-300">Prénom</label>
                    <input formControlName="firstName" type="text" class="form-input" placeholder="Ex: Jean">
                 </div>
                 <div class="space-y-2">
                    <label class="text-sm font-bold text-slate-700 dark:text-slate-300">Nom</label>
                    <input formControlName="lastName" type="text" class="form-input" placeholder="Ex: Dupont">
                 </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div class="space-y-2">
                    <label class="text-sm font-bold text-slate-700 dark:text-slate-300">Email</label>
                    <input formControlName="email" type="email" class="form-input" placeholder="jean.dupont@email.com">
                 </div>
                 <div class="space-y-2">
                    <label class="text-sm font-bold text-slate-700 dark:text-slate-300">Téléphone</label>
                    <input formControlName="phone" type="tel" class="form-input" placeholder="06 12 34 56 78">
                 </div>
              </div>

              <div class="space-y-2">
                 <label class="text-sm font-bold text-slate-700 dark:text-slate-300">Lien LinkedIn (Optionnel)</label>
                 <input formControlName="linkedinUrl" type="url" class="form-input" placeholder="https://linkedin.com/in/...">
              </div>

              <!-- CV Upload -->
              <div class="space-y-2">
                 <label class="text-sm font-bold text-slate-700 dark:text-slate-300">Votre CV (PDF ou Word)</label>
                 
                 <div *ngIf="!selectedFile" 
                      (click)="fileInput.click()"
                      class="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 dark:hover:bg-violet-900/5 transition-all">
                    <div class="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center text-violet-600">
                       <i-lucide [img]="Upload" class="w-6 h-6"></i-lucide>
                    </div>
                    <div class="text-center">
                       <p class="font-bold">Cliquez pour uploader</p>
                       <p class="text-xs text-slate-400">PDF, DOCX (Max 5MB)</p>
                    </div>
                    <input #fileInput type="file" (change)="onFileSelected($event)" class="hidden" accept=".pdf,.doc,.docx">
                 </div>

                 <div *ngIf="selectedFile" class="flex items-center justify-between p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800 rounded-2xl">
                    <div class="flex items-center gap-3 text-emerald-700 dark:text-emerald-400">
                       <i-lucide [img]="FileText" class="w-5 h-5"></i-lucide>
                       <span class="font-bold text-sm">{{selectedFile.name}}</span>
                    </div>
                    <button (click)="removeFile()" class="p-1 hover:bg-emerald-200 dark:hover:bg-emerald-800 rounded-full transition-colors">
                       <i-lucide [img]="X" class="w-4 h-4"></i-lucide>
                    </button>
                 </div>
              </div>

              <!-- GDPR -->
              <div class="flex items-start gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                 <input formControlName="gdprConsent" type="checkbox" class="mt-1 w-5 h-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500">
                 <label class="text-xs text-slate-500 leading-relaxed">
                   J'accepte que mes données personnelles soient traitées dans le cadre de ce recrutement. 
                   Celles-ci seront conservées pendant une durée maximale de 2 ans conformément au RGPD.
                 </label>
              </div>

              <!-- Submit -->
              <button type="submit" 
                      [disabled]="applyForm.invalid || !selectedFile || loading()"
                      class="w-full py-4 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-2xl shadow-xl shadow-violet-200 dark:shadow-none transition-all transform hover:scale-[1.02] active:scale-95 font-bold flex items-center justify-center gap-2">
                 <i-lucide *ngIf="!loading()" [img]="Send" class="w-5 h-5"></i-lucide>
                 <span *ngIf="loading()" class="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></span>
                 {{ loading() ? 'Envoi en cours...' : 'Envoyer ma candidature' }}
              </button>
           </form>
        </div>

        <ng-template #successTemplate>
           <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6">
              <div class="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 mx-auto shadow-lg shadow-emerald-100 dark:shadow-none">
                 <i-lucide [img]="CheckCircle2" class="w-10 h-10"></i-lucide>
              </div>
              <div class="space-y-2">
                 <h2 class="text-3xl font-extrabold text-slate-900 dark:text-white">Candidature envoyée !</h2>
                 <p class="text-slate-500 max-w-sm mx-auto">Merci de votre intérêt. Notre équipe RH va examiner votre profil avec l'aide de notre assistant IA et reviendra vers vous très prochainement.</p>
              </div>
              <button routerLink="/careers" class="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold hover:bg-slate-800 transition-all">
                 Découvrir d'autres offres
              </button>
           </div>
        </ng-template>

      </div>
    </div>
  `,
  styles: [`
    .form-input {
      @apply w-full px-5 py-3 bg-slate-50 dark:bg-slate-800 border-2 border-transparent rounded-2xl focus:bg-white dark:focus:bg-slate-900 focus:border-violet-500 transition-all outline-none text-slate-800 dark:text-white font-medium;
    }
    .animate-fade-in { animation: fadeIn 0.5s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class ApplyComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private recruitmentService = inject(RecrutementService);

  job = signal<JobPosting | null>(null);
  loading = signal(false);
  submitted = signal(false);
  selectedFile: File | null = null;

  applyForm: FormGroup = this.fb.group({
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    linkedinUrl: [''],
    gdprConsent: [false, Validators.requiredTrue]
  });

  // Icons
  protected readonly ChevronLeft = ChevronLeft;
  protected readonly Upload = Upload;
  protected readonly Send = Send;
  protected readonly CheckCircle2 = CheckCircle2;
  protected readonly FileText = FileText;
  protected readonly X = X;

  ngOnInit() {
    const jobId = Number(this.route.snapshot.paramMap.get('id'));
    if (jobId) {
      this.recruitmentService.getPublicJob(jobId).subscribe((j: JobPosting) => this.job.set(j));
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  removeFile() {
    this.selectedFile = null;
  }

  onSubmit() {
    if (this.applyForm.valid && this.selectedFile && this.job()) {
      this.loading.set(true);
      this.recruitmentService.submitApplication(this.job()!.id, this.applyForm.value, this.selectedFile)
        .subscribe({
          next: () => {
            this.loading.set(false);
            this.submitted.set(true);
          },
          error: (err) => {
            this.loading.set(false);
            alert(err.error?.message || "Une erreur est survenue lors de l'envoi.");
          }
        });
    }
  }
}
