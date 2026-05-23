import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { RecrutementService, JobPosting } from '../../../../features/rh/recrutement/services/recrutement.service';
import { 
  LucideAngularModule, 
  ChevronLeft, 
  MapPin, 
  Briefcase, 
  Clock, 
  DollarSign, 
  AlertCircle, 
  ArrowRight,
  CheckCircle,
  Building,
  Laptop
} from 'lucide-angular';

@Component({
  selector: 'app-job-detail-public',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-indigo-100 selection:text-indigo-900 pt-24 lg:pt-32 pb-20">
      <div class="max-w-5xl mx-auto px-6 space-y-8">
        
        <!-- Back Link -->
        <div>
          <a routerLink="/careers" class="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
            <i-lucide [img]="ChevronLeft" class="w-4 h-4"></i-lucide>
            Retour aux offres
          </a>
        </div>

        <!-- 1. LOADING STATE -->
        <div *ngIf="loading()" class="py-20 text-center">
          <span class="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent inline-block"></span>
          <p class="text-slate-500 dark:text-slate-400 mt-4 font-medium">Chargement des détails de l'offre...</p>
        </div>

        <!-- 2. EXPIRED OR CLOSED STATE -->
        <div *ngIf="!loading() && isClosedOrExpired()" class="max-w-xl mx-auto py-12 px-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl text-center shadow-xl space-y-6">
          <div class="w-16 h-16 bg-red-100 dark:bg-red-950/30 rounded-full flex items-center justify-center text-red-600 mx-auto">
            <i-lucide [img]="AlertCircle" class="w-8 h-8"></i-lucide>
          </div>
          <div class="space-y-2">
            <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Cette offre n'est plus disponible.</h2>
            <p class="text-slate-500 dark:text-slate-400">Le poste a été pourvu ou l'offre de recrutement a expiré.</p>
          </div>
          <button routerLink="/careers" class="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none transition-all transform hover:scale-[1.02] active:scale-95 flex items-center gap-2 mx-auto">
            Voir les autres offres
            <i-lucide [img]="ArrowRight" class="w-4 h-4"></i-lucide>
          </button>
        </div>

        <!-- 3. MAIN DETAIL CONTENT -->
        <div *ngIf="!loading() && !isClosedOrExpired() && job() as j" class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          <!-- Left: Detailed Posting Info -->
          <div class="lg:col-span-2 space-y-8">
            <!-- Header Info Card -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-6">
              <div class="space-y-3">
                <span class="px-3 py-1 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold uppercase tracking-wider">
                  {{ j.department }}
                </span>
                <h1 class="text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white leading-tight">
                  {{ j.title }}
                </h1>
                <p class="text-lg font-bold text-slate-500 dark:text-slate-400" *ngIf="j.entrepriseName">
                  {{ j.entrepriseName }}
                </p>
              </div>

              <!-- Metadata Chips Grid -->
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-850">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    <i-lucide [img]="Briefcase" class="w-5 h-5"></i-lucide>
                  </div>
                  <div>
                    <p class="text-xs text-slate-400 font-medium">Contrat</p>
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-200">{{ getEmploymentTypeLabel(j.employmentType) }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    <i-lucide [img]="Laptop" class="w-5 h-5"></i-lucide>
                  </div>
                  <div>
                    <p class="text-xs text-slate-400 font-medium">Mode de travail</p>
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-200">{{ getWorkModeLabel(j.workMode) }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    <i-lucide [img]="MapPin" class="w-5 h-5"></i-lucide>
                  </div>
                  <div>
                    <p class="text-xs text-slate-400 font-medium">Localisation</p>
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-200">{{ j.location }}</p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    <i-lucide [img]="Clock" class="w-5 h-5"></i-lucide>
                  </div>
                  <div>
                    <p class="text-xs text-slate-400 font-medium">Expérience</p>
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {{ j.minExperienceYears ? j.minExperienceYears + '+ ans' : getExperienceLevelLabel(j.experienceLevel) }}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-3" *ngIf="j.salaryMin || j.salaryMax">
                  <div class="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-400">
                    <i-lucide [img]="DollarSign" class="w-5 h-5"></i-lucide>
                  </div>
                  <div>
                    <p class="text-xs text-slate-400 font-medium">Salaire</p>
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {{ formatSalaryRange(j.salaryMin, j.salaryMax, j.salaryCurrency) }}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Job Description -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">Description du poste</h2>
              <p class="text-slate-650 dark:text-slate-355 leading-relaxed whitespace-pre-line">{{ j.description }}</p>
            </div>

            <!-- Responsibilities -->
            <div *ngIf="formatList(j.responsibilities).length > 0" class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">Missions & Responsabilités</h2>
              <ul class="space-y-3">
                <li *ngFor="let item of formatList(j.responsibilities)" class="flex items-start gap-3">
                  <i-lucide [img]="CheckCircle" class="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0"></i-lucide>
                  <span class="text-slate-650 dark:text-slate-355 leading-relaxed">{{ item }}</span>
                </li>
              </ul>
            </div>

            <!-- Skills -->
            <div *ngIf="formatList(j.requiredSkills).length > 0" class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
              <h2 class="text-xl font-bold text-slate-900 dark:text-white">Compétences requises</h2>
              <div class="flex flex-wrap gap-2">
                <span *ngFor="let skill of formatList(j.requiredSkills)" class="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-semibold">
                  {{ skill }}
                </span>
              </div>
            </div>
          </div>

          <!-- Right Sidebar: Quick Actions -->
          <div class="space-y-6">
            <div class="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-3xl p-8 shadow-xl space-y-6">
              <h3 class="text-xl font-black leading-tight">Prêt à façonner le futur des RH ?</h3>
              <p class="text-indigo-100 text-sm leading-relaxed">
                Postulez dès aujourd'hui et rejoignez notre équipe dynamique pour relever des défis technologiques passionnants.
              </p>
              
              <a [routerLink]="['apply']" class="w-full py-4 bg-white text-indigo-700 font-bold rounded-2xl shadow-lg transition-all hover:bg-slate-50 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 no-underline">
                Postuler à cette offre
                <i-lucide [img]="ArrowRight" class="w-4 h-4"></i-lucide>
              </a>
            </div>

            <!-- Summary Facts -->
            <div class="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
              <h4 class="text-xs font-bold uppercase tracking-wider text-slate-400">Informations clés</h4>
              <div class="space-y-3">
                <div class="flex justify-between items-center text-sm">
                  <span class="text-slate-500">Publiée le</span>
                  <span class="font-bold text-slate-800 dark:text-slate-200">{{ j.publishedAt ? (j.publishedAt | date:'mediumDate') : (j.createdAt | date:'mediumDate') }}</span>
                </div>
                <div class="flex justify-between items-center text-sm" *ngIf="j.openingsCount">
                  <span class="text-slate-500">Postes ouverts</span>
                  <span class="font-bold text-slate-800 dark:text-slate-200">{{ j.openingsCount }}</span>
                </div>
                <div class="flex justify-between items-center text-sm" *ngIf="j.deadline">
                  <span class="text-slate-500">Date limite</span>
                  <span class="font-bold text-slate-850 dark:text-red-400">{{ j.deadline | date:'mediumDate' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `
})
export class JobDetailPublicComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private recruitmentService = inject(RecrutementService);

  job = signal<JobPosting | null>(null);
  loading = signal(true);
  isClosedOrExpired = signal(false);

  // Icons definitions for template binding
  protected readonly ChevronLeft = ChevronLeft;
  protected readonly MapPin = MapPin;
  protected readonly Briefcase = Briefcase;
  protected readonly Clock = Clock;
  protected readonly DollarSign = DollarSign;
  protected readonly AlertCircle = AlertCircle;
  protected readonly ArrowRight = ArrowRight;
  protected readonly CheckCircle = CheckCircle;
  protected readonly Building = Building;
  protected readonly Laptop = Laptop;

  ngOnInit() {
    const jobId = Number(this.route.snapshot.paramMap.get('id'));
    if (!jobId) {
      this.isClosedOrExpired.set(true);
      this.loading.set(false);
      return;
    }

    this.recruitmentService.getPublicJob(jobId).subscribe({
      next: (j: JobPosting) => {
        if (!j || j.status === 'CLOSED' || j.status === 'ARCHIVED') {
          this.isClosedOrExpired.set(true);
        } else {
          this.job.set(j);
        }
        this.loading.set(false);
      },
      error: () => {
        this.isClosedOrExpired.set(true);
        this.loading.set(false);
      }
    });
  }

  // Label Formatter Helpers
  getEmploymentTypeLabel(type: string): string {
    const map: Record<string, string> = {
      'CDI': 'CDI',
      'CDD': 'CDD',
      'STAGE': 'Stage',
      'FREELANCE': 'Freelance',
      'INTERNSHIP': 'Stage'
    };
    return map[type.toUpperCase()] || type;
  }

  getWorkModeLabel(mode: string): string {
    const map: Record<string, string> = {
      'REMOTE': 'Télétravail',
      'HYBRID': 'Hybride',
      'ONSITE': 'Présentiel',
      'FULL_REMOTE': 'Télétravail total'
    };
    return map[mode.toUpperCase()] || mode;
  }

  getExperienceLevelLabel(level: string): string {
    const map: Record<string, string> = {
      'JUNIOR': 'Débutant',
      'MID_LEVEL': 'Intermédiaire',
      'SENIOR': 'Expérimenté',
      'LEAD': 'Directeur / Lead'
    };
    return map[level.toUpperCase()] || level;
  }

  formatSalaryRange(min?: number, max?: number, currency: string = 'EUR'): string {
    const sym = currency === 'TND' ? 'DT' : currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
    if (min && max) {
      return `${this.formatK(min)} - ${this.formatK(max)} ${sym}`;
    }
    if (min) return `À partir de ${this.formatK(min)} ${sym}`;
    if (max) return `Jusqu'à ${this.formatK(max)} ${sym}`;
    return 'Non précisé';
  }

  private formatK(val: number): string {
    if (val >= 1000) {
      return (val / 1000).toFixed(0) + 'k';
    }
    return val.toString();
  }

  // Utility to parse bulleted strings (newlines or comma separated) into string arrays
  formatList(text?: string): string[] {
    if (!text) return [];
    
    // Check if it's bullet lists or newlines
    return text
      .split('\n')
      .map(line => {
        // clean up bullet characters
        let cleaned = line.trim().replace(/^[\*\-\•]\s*/, '');
        return cleaned;
      })
      .filter(line => line.length > 0);
  }
}
