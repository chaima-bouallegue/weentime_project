import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { RecrutementService, JobPosting } from '../../../../features/rh/recrutement/services/recrutement.service';
import { LucideAngularModule, Briefcase, MapPin, ArrowRight, Search, Globe } from 'lucide-angular';

@Component({
  selector: 'app-careers',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  template: `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-violet-100 selection:text-violet-900 pt-20 lg:pt-28">
      
      <!-- Hero Section -->
      <section class="py-16 px-6 relative overflow-hidden">
        <div class="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-100/50 via-transparent to-transparent -z-10 dark:from-violet-900/10"></div>
        <div class="max-w-4xl mx-auto text-center space-y-6">
          <h1 class="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
            Rejoignez l'aventure <br> <span class="text-violet-600">WeenTime</span>
          </h1>
          <p class="text-xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
            Nous construisons l'avenir de la gestion RH intelligente. Découvrez nos opportunités et trouvez votre prochain défi.
          </p>
        </div>
      </section>

      <!-- Jobs Section -->
      <section class="max-w-5xl mx-auto px-6 pb-20">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-2xl">
          <div class="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
            <h2 class="text-2xl font-bold flex items-center gap-3">
              <i-lucide [img]="Globe" class="w-6 h-6 text-violet-500"></i-lucide>
              Offres disponibles ({{jobs().length}})
            </h2>
            <div class="relative w-full md:w-80">
               <i-lucide [img]="Search" class="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"></i-lucide>
               <input type="text" placeholder="Rechercher un poste..." class="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl focus:ring-2 focus:ring-violet-500 transition-all outline-none">
            </div>
          </div>

          <div class="grid grid-cols-1 gap-4">
            @for (job of jobs(); track job.id) {
              <div class="group flex flex-col md:flex-row md:items-center justify-between p-6 bg-slate-50 dark:bg-slate-800/50 hover:bg-violet-50 dark:hover:bg-violet-900/10 rounded-2xl border border-transparent hover:border-violet-200 dark:hover:border-violet-800 transition-all duration-300 cursor-pointer"
                   [routerLink]="['/careers', job.id]">
                <div class="space-y-1">
                   <h3 class="text-xl font-bold text-slate-900 dark:text-white group-hover:text-violet-600 transition-colors">
                     {{job.title}}
                   </h3>
                   <div class="text-sm font-bold text-violet-500 uppercase tracking-wider mb-1" *ngIf="job.entrepriseName">
                      {{job.entrepriseName}}
                   </div>
                   <div class="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400 font-medium">
                      <span class="flex items-center gap-1.5"><i-lucide [img]="MapPin" class="w-3.5 h-3.5"></i-lucide> {{job.location}}</span>
                      <span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                      <span>{{job.employmentType}}</span>
                      <span class="w-1.5 h-1.5 rounded-full bg-slate-300"></span>
                      <span>{{job.workMode}}</span>
                   </div>
                </div>
                
                <div class="mt-4 md:mt-0 flex items-center gap-3">
                   <span class="text-sm font-bold text-violet-600 opacity-0 group-hover:opacity-100 transition-all -translate-x-2 group-hover:translate-x-0">Voir l'offre</span>
                   <div class="w-10 h-10 rounded-full bg-white dark:bg-slate-700 shadow-md flex items-center justify-center text-slate-400 group-hover:bg-violet-600 group-hover:text-white transition-all transform group-hover:rotate-[-45deg]">
                      <i-lucide [img]="ArrowRight" class="w-5 h-5"></i-lucide>
                   </div>
                </div>
              </div>
            } @empty {
              <div class="py-20 text-center text-slate-400 space-y-4">
                 <div class="w-16 h-16 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-2">
                    <i-lucide [img]="Briefcase" class="w-8 h-8"></i-lucide>
                 </div>
                 <p class="text-xl font-bold text-slate-800 dark:text-white">Aucune offre disponible pour le moment</p>
                 <p class="text-sm text-slate-500 dark:text-slate-400">Revenez bientôt, nous recrutons régulièrement.</p>
              </div>
            }
          </div>
        </div>
      </section>
    </div>
  `
})
export class CareersComponent implements OnInit {
  private recruitmentService = inject(RecrutementService);
  jobs = signal<JobPosting[]>([]);

  // Icons
  protected readonly Briefcase = Briefcase;
  protected readonly MapPin = MapPin;
  protected readonly ArrowRight = ArrowRight;
  protected readonly Search = Search;
  protected readonly Globe = Globe;

  ngOnInit() {
    this.recruitmentService.getPublicJobs().subscribe(jobs => this.jobs.set(jobs));
  }
}

