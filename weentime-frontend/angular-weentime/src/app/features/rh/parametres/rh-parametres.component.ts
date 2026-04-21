import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { RhParametresCrudComponent, CrudColumn } from './components/rh-parametres-crud.component';
import { RhSoldesManagerComponent } from './components/rh-soldes-manager.component';

@Component({
  selector: 'app-rh-parametres',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RhParametresCrudComponent, RhSoldesManagerComponent],
  template: `
    <div class="min-h-screen bg-[#f8fafc] dark:bg-[#0f172a] p-4 lg:p-8 transition-colors duration-300">
      
      <!-- Top Header -->
      <header class="mb-8 animate-in fade-in slide-in-from-top-4 duration-700">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <div class="p-3 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-100 dark:shadow-indigo-900/40 transform transition-transform hover:rotate-12">
                <lucide-icon name="settings" class="w-6 h-6 text-white"></lucide-icon>
              </div>
              <h1 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-white">
                Paramètres <span class="text-indigo-600 dark:text-indigo-400 font-light lowercase">RH</span>
              </h1>
            </div>
            <p class="text-slate-400 dark:text-slate-500 font-medium ml-16 text-sm">Configurez l'écosystème de votre capital humain</p>
          </div>
          
          <!-- Quick stats or shortcuts could go here -->
          <div class="hidden lg:flex items-center gap-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md p-2 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
             <div class="px-4 py-2 text-center border-r border-slate-200 dark:border-slate-700">
                <span class="block text-xs font-bold text-slate-400 uppercase tracking-widest">Modules</span>
                <span class="text-lg font-bold text-slate-700 dark:text-slate-200">5</span>
             </div>
             <div class="px-4 py-2 text-center">
                <span class="block text-xs font-bold text-slate-400 uppercase tracking-widest">Statut</span>
                <span class="flex items-center gap-2 text-sm font-bold text-emerald-500">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Opérationnel
                </span>
             </div>
          </div>
        </div>
      </header>

      <div class="grid grid-cols-1 xl:grid-cols-12 gap-8">
        
        <!-- Navigation Sidebar -->
        <aside class="xl:col-span-3 space-y-2 animate-in fade-in slide-in-from-left-4 duration-700 delay-150">
          @for (tab of tabs; track tab.id) {
            <button
              (click)="activeTab.set(tab.id)"
              class="group relative w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 overflow-hidden"
              [ngClass]="activeTab() === tab.id 
                ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-200 dark:shadow-indigo-900/40 translate-x-2' 
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 border border-slate-200/50 dark:border-slate-700/50 hover:border-indigo-200 dark:hover:border-indigo-500/30'">
              
              <!-- Active Indicator Background -->
              @if (activeTab() === tab.id) {
                <div class="absolute inset-0 bg-gradient-to-r from-indigo-600 to-indigo-500"></div>
              }

              <lucide-icon [name]="tab.icon" size="22" class="relative z-10 transition-transform group-hover:scale-110"
                [class]="activeTab() === tab.id ? 'text-white' : 'text-slate-400 group-hover:text-indigo-500'">
              </lucide-icon>
              
              <div class="relative z-10 flex flex-col items-start">
                <span class="font-bold text-sm tracking-wide">{{ tab.label }}</span>
                <span class="text-[10px] font-medium opacity-70 group-hover:opacity-100" 
                  [class]="activeTab() === tab.id ? 'text-white/80' : 'text-slate-400'">
                  {{ tab.description }}
                </span>
              </div>

              @if (activeTab() === tab.id) {
                <div class="absolute right-4 w-2 h-2 rounded-full bg-white animate-bounce"></div>
              }
            </button>
          }
        </aside>

        <!-- Main Content Area -->
        <main class="xl:col-span-9 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <div class="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-200/50 dark:border-slate-700/50 shadow-2xl shadow-slate-200/50 dark:shadow-black/20 overflow-hidden min-h-[600px] flex flex-col">
            
            <!-- Tab Header -->
            <div class="px-8 py-6 border-b border-slate-100 dark:border-slate-700/50 bg-slate-50/50 dark:bg-slate-800/50 backdrop-blur-xl">
              <div class="flex items-center gap-4">
                <div class="w-12 h-12 rounded-2xl bg-white dark:bg-slate-700 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-100 dark:border-slate-600">
                  <lucide-icon [name]="getActiveIcon()" size="24"></lucide-icon>
                </div>
                <div>
                  <h2 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">{{ getActiveLabel() }}</h2>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 rounded-md uppercase tracking-wider">Configuration</span>
                    <span class="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                    <span class="text-xs font-medium text-slate-400">{{ getActiveDescription() }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Scrollable Content -->
            <div class="flex-1 overflow-y-auto p-8 custom-scrollbar">
              @switch (activeTab()) {
                @case ('conges') {
                  <app-rh-parametres-crud 
                    title="Types de Congés" 
                    endpoint="api/v1/rh/type-conges" 
                    [columns]="congeColumns">
                  </app-rh-parametres-crud>
                }
                @case ('soldes') {
                  <app-rh-soldes-manager></app-rh-soldes-manager>
                }
                @case ('absences') {
                  <app-rh-parametres-crud 
                    title="Types d'Absences" 
                    endpoint="api/v1/rh/type-absences" 
                    [columns]="absenceColumns">
                  </app-rh-parametres-crud>
                }
                @case ('autorisations') {
                  <app-rh-parametres-crud 
                    title="Types d'Autorisations" 
                    endpoint="api/v1/rh/parametres/types-autorisations" 
                    [columns]="autorisationColumns">
                  </app-rh-parametres-crud>
                }
                @case ('documents') {
                  <app-rh-parametres-crud 
                    title="Modèles de Documents" 
                    endpoint="api/v1/rh/parametres/types-documents" 
                    [columns]="documentColumns">
                  </app-rh-parametres-crud>
                }
              }
            </div>

          </div>
        </main>

      </div>
    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #e2e8f0;
      border-radius: 10px;
    }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #1e293b;
    }
  `]
})
export class RhParametresComponent {
  
  tabs = [
    { id: 'conges', label: 'Types de Congés', icon: 'tent', description: 'Congés annuels, RTT, etc.' },
    { id: 'soldes', label: 'Soldes Collaborateurs', icon: 'piggy-bank', description: 'Gérer les compteurs individuels' },
    { id: 'absences', label: 'Types d\'Absences', icon: 'user-x', description: 'Maladie, maternité, sans solde' },
    { id: 'autorisations', label: 'Types d\'Autorisations', icon: 'clock', description: 'Sorties, retards exceptionnels' },
    { id: 'documents', label: 'Modèles de Documents', icon: 'file-text', description: 'Contrats, attestations, etc.' }
  ];

  activeTab = signal<string>('conges');

  getActiveLabel() {
    return this.tabs.find(t => t.id === this.activeTab())?.label || '';
  }

  getActiveIcon() {
    return this.tabs.find(t => t.id === this.activeTab())?.icon || 'settings';
  }

  getActiveDescription() {
    return this.tabs.find(t => t.id === this.activeTab())?.description || '';
  }

  congeColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { key: 'nombreJoursMax', label: 'Jours max', type: 'number' },
    { key: 'decompteJours', label: 'Décompter jours ?', type: 'boolean' },
    { key: 'requireJustificatif', label: 'Justificatif exigé ?', type: 'boolean' }
  ];

  absenceColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { 
      key: 'type', 
      label: 'Type (Catégorie)', 
      type: 'enum', 
      required: true,
      options: [
        { value: 'MALADIE', label: 'Maladie' },
        { value: 'MATERNITE', label: 'Maternité' },
        { value: 'ACCIDENT_TRAVAIL', label: 'Accident de travail' },
        { value: 'SANS_SOLDE', label: 'Sans solde' },
        { value: 'AUTRE', label: 'Autre' }
      ]
    },
    { key: 'nombreJoursMax', label: 'Jours max', type: 'number' },
    { key: 'decompteJours', label: 'Décompter jours ?', type: 'boolean' },
    { key: 'requireJustificatif', label: 'Justificatif exigé ?', type: 'boolean' }
  ];

  autorisationColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { key: 'maxHeuresMois', label: 'Heures max par mois', type: 'number' },
    { key: 'requireJustificatif', label: 'Justificatif exigé ?', type: 'boolean' }
  ];

  documentColumns: CrudColumn[] = [
    { key: 'code', label: 'Code unique', type: 'text', required: true },
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { key: 'requireSignature', label: 'Signature exigée ?', type: 'boolean' },
    { key: 'enableTemplate', label: 'Généré via modèle ?', type: 'boolean' }
  ];

}

