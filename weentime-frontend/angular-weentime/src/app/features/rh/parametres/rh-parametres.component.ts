import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { 
  LucideAngularModule, 
  Settings, 
  Tent, 
  PiggyBank, 
  Monitor, 
  Clock, 
  FileText, 
  CalendarCheck
} from 'lucide-angular';
import { RhParametresCrudComponent, CrudColumn } from './components/rh-parametres-crud.component';
import { RhSoldesManagerComponent } from './components/rh-soldes-manager.component';
import { RhConfigStore } from '../../../core/services/rh-config.store';

@Component({
  selector: 'app-rh-parametres',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    LucideAngularModule,
    RhParametresCrudComponent,
    RhSoldesManagerComponent
  ],
  template: `
    <div class="animate-fade-in">
      
      <!-- Top Header (Simplified) -->
      <header class="mb-8">
        <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 class="text-3xl font-black tracking-tight text-slate-800 dark:text-white">
              Paramètres <span class="text-indigo-600 dark:text-indigo-400 font-light lowercase">RH</span>
            </h1>
            <p class="text-slate-400 dark:text-slate-500 font-medium text-sm">Configurez l'écosystème de votre capital humain</p>
          </div>
          
          <!-- Quick stats -->
          <div class="parametres-page-header hidden lg:flex items-center gap-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md p-2 rounded-2xl border border-slate-200/50 dark:border-slate-700/50 shadow-sm">
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
        <aside class="xl:col-span-3 space-y-3 animate-in fade-in slide-in-from-left-4 duration-700 delay-150">
          @for (tab of tabs; track tab.id) {
            <button
              (click)="selectTab(tab.id)"
              class="group relative w-full flex items-center gap-4 px-6 py-5 rounded-[1.5rem] transition-all duration-500 overflow-hidden border"
              [ngClass]="activeTab() === tab.id 
                ? 'bg-indigo-600 text-white shadow-2xl shadow-indigo-200/50 dark:shadow-indigo-900/40 translate-x-3 border-transparent' 
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 border-slate-200/60 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-500/30'">
              
              <!-- Active Indicator Gradient -->
              @if (activeTab() === tab.id) {
                <div class="absolute inset-0 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 bg-[length:200%_100%] animate-gradient"></div>
              }

              <lucide-icon [img]="tab.icon" size="24" class="relative z-10 transition-all duration-500 group-hover:scale-110 group-hover:rotate-6"
                [class]="activeTab() === tab.id ? 'text-white drop-shadow-md' : 'text-slate-400 group-hover:text-indigo-500'">
              </lucide-icon>
              
              <div class="relative z-10 flex flex-col items-start transition-all duration-300">
                <span class="font-extrabold text-sm tracking-tight mb-0.5">{{ tab.label }}</span>
                <span class="text-[11px] font-semibold leading-tight opacity-70 group-hover:opacity-100" 
                  [class]="activeTab() === tab.id ? 'text-indigo-50' : 'text-slate-400'">
                  {{ tab.description }}
                </span>
              </div>

              @if (activeTab() === tab.id) {
                <div class="absolute right-6 w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] animate-pulse"></div>
              }
            </button>
          }
        </aside>

        <!-- Main Content Area -->
        <main class="xl:col-span-9 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-300">
          <div class="bg-white dark:bg-slate-800 rounded-[2.5rem] border border-slate-200/60 dark:border-slate-700/60 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] dark:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] overflow-hidden min-h-[650px] flex flex-col transition-all duration-500">
            
            <!-- Tab Header -->
            <div class="px-10 py-8 border-b border-slate-100 dark:border-slate-700/50 bg-white/50 dark:bg-slate-800/50 backdrop-blur-2xl">
              <div class="flex items-center gap-6">
                <div class="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-inner border border-indigo-100/50 dark:border-indigo-500/20 transform transition-transform hover:scale-105 duration-300">
                  <lucide-icon [img]="getActiveIcon()" size="28" class="drop-shadow-sm"></lucide-icon>
                </div>
                <div>
                  <h2 class="text-3xl font-black text-slate-800 dark:text-white tracking-tighter">{{ getActiveLabel() }}</h2>
                  <div class="flex items-center gap-3 mt-1.5">
                    <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 bg-indigo-100/80 dark:bg-indigo-500/20 px-2.5 py-1 rounded-lg uppercase tracking-widest border border-indigo-200/30 dark:border-indigo-500/30">Configuration</span>
                    <span class="w-1.5 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"></span>
                    <span class="text-sm font-semibold text-slate-400 tracking-tight">{{ getActiveDescription() }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Scrollable Content -->
            <div class="flex-1 overflow-y-auto p-10 custom-scrollbar">
              @if (activeTab() === 'conges') {
                <app-rh-parametres-crud 
                  title="Types de Congés" 
                  endpoint="rh/type-conges" 
                  [columns]="congeColumns">
                </app-rh-parametres-crud>
              }
              @if (activeTab() === 'soldes') {
                <app-rh-soldes-manager></app-rh-soldes-manager>
              }
              @if (activeTab() === 'teletravail') {
                <!-- Global Quota Card Premium -->
                <div class="mb-10 p-8 bg-gradient-to-br from-indigo-600 to-violet-700 dark:from-indigo-900 dark:to-violet-900 rounded-[2rem] shadow-2xl shadow-indigo-200/50 dark:shadow-none border border-indigo-500/20 relative overflow-hidden group">
                  
                  <!-- Decorative patterns -->
                  <div class="absolute -right-16 -top-16 w-64 h-64 bg-white/10 rounded-full blur-3xl transition-transform group-hover:scale-125 duration-1000"></div>
                  <div class="absolute -left-16 -bottom-16 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl"></div>

                  <div class="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div class="flex items-center gap-5">
                      <div class="w-16 h-16 rounded-[1.25rem] bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-xl shadow-black/10">
                        <lucide-icon [img]="CalendarCheckIcon" [size]="32" class="text-white drop-shadow-md"></lucide-icon>
                      </div>
                      <div class="text-white">
                        <h3 class="text-xl font-black tracking-tight mb-1">Quota Mensuel Global</h3>
                        <p class="text-sm text-indigo-100 font-medium opacity-90 max-w-xs">Nombre maximal de jours de télétravail autorisés par mois pour tous les collaborateurs.</p>
                      </div>
                    </div>
                    
                    <div class="flex items-center gap-4 bg-white/10 backdrop-blur-xl p-3 rounded-2xl border border-white/20 shadow-2xl">
                      <div class="flex flex-col items-center gap-1">
                        <input type="number" [ngModel]="quotaMensuel()" (ngModelChange)="onQuotaChange($event)"
                          class="w-24 px-4 py-3 text-center text-2xl font-black bg-white dark:bg-slate-900 border-2 border-indigo-100 dark:border-slate-700 rounded-xl focus:ring-4 focus:ring-white/20 focus:border-white text-indigo-600 dark:text-indigo-400 outline-none shadow-inner transition-all"
                          min="0" max="31" />
                        <span class="text-[10px] font-black text-white/70 uppercase tracking-widest">jours</span>
                      </div>
                      <button (click)="saveQuota()" 
                        class="px-8 py-4 bg-white text-indigo-600 hover:bg-indigo-50 text-sm font-black rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0 active:scale-95 uppercase tracking-widest">
                        Enregistrer
                      </button>
                    </div>
                  </div>
                </div>

                <app-rh-parametres-crud 
                  title="Types de Télétravail" 
                  endpoint="rh/type-teletravail" 
                  [columns]="teletravailColumns">
                </app-rh-parametres-crud>
              }
              @if (activeTab() === 'autorisations') {
                <app-rh-parametres-crud 
                  title="Types d'Autorisations" 
                  endpoint="rh/parametres/types-autorisations" 
                  [columns]="autorisationColumns">
                </app-rh-parametres-crud>
              }
              @if (activeTab() === 'documents') {
                <app-rh-parametres-crud 
                  title="Modèles de Documents" 
                  endpoint="rh/parametres/types-documents" 
                  [columns]="documentColumns">
                </app-rh-parametres-crud>
              }
            </div>

          </div>
        </main>

      </div>
    </div>
  `,
  styles: [`
    .custom-scrollbar::-webkit-scrollbar { width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
    .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; }
    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    .animate-gradient { animation: gradient 3s ease infinite; }
  `]
})
export class RhParametresComponent implements OnInit {
  private configStore = inject(RhConfigStore);
  
  readonly SettingsIcon = Settings;
  readonly CalendarCheckIcon = CalendarCheck;

  quotaMensuel = signal(this.configStore.teletravailQuota());
  isLoading = this.configStore.isLoading;

  tabs = [
    { id: 'conges', label: 'Types de Congés', icon: Tent, description: 'Congés annuels, RTT, etc.' },
    { id: 'soldes', label: 'Soldes Collaborateurs', icon: PiggyBank, description: 'Gérer les compteurs individuels' },
    { id: 'teletravail', label: 'Télétravail', icon: Monitor, description: 'Gestion des quotas et types de télétravail' },
    { id: 'autorisations', label: 'Types d\'Autorisations', icon: Clock, description: 'Sorties, retards exceptionnels' },
    { id: 'documents', label: 'Modèles de Documents', icon: FileText, description: 'Contrats, attestations, etc.' }
  ];

  activeTab = signal<string>('conges');

  selectTab(id: string) {
    this.activeTab.set(id);
  }

  getActiveLabel() {
    return this.tabs.find(t => t.id === this.activeTab())?.label || '';
  }

  getActiveIcon() {
    return this.tabs.find(t => t.id === this.activeTab())?.icon || Settings;
  }

  getActiveDescription() {
    return this.tabs.find(t => t.id === this.activeTab())?.description || '';
  }

  ngOnInit(): void {
    // Sync local signal with store if needed, but the store is pre-fetched
    this.quotaMensuel.set(this.configStore.teletravailQuota());
  }

  onQuotaChange(value: number): void {
    this.quotaMensuel.set(value);
  }

  saveQuota(): void {
    this.configStore.saveTeletravailQuota(this.quotaMensuel()).subscribe();
  }

  congeColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { key: 'joursMax', label: 'Jours max', type: 'number' },
    { key: 'decompterJours', label: 'Décompter jours ?', type: 'boolean' },
    { key: 'justificatifExige', label: 'Justificatif exigé ?', type: 'boolean' }
  ];

  teletravailColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    {
      key: 'periode',
      label: 'Période',
      type: 'enum',
      required: true,
      options: [
        { value: 'JOURNEE_COMPLETE', label: 'Journée complète' },
        { value: 'MATIN', label: 'Demi-journée Matin' },
        { value: 'APRES_MIDI', label: 'Demi-journée Après-midi' }
      ]
    },
    { key: 'active', label: 'Actif ?', type: 'boolean' }
  ];

  autorisationColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { key: 'maxHeuresMois', label: 'Heures max par mois', type: 'number' },
    { key: 'requireJustificatif', label: 'Justificatif exigé ?', type: 'boolean' }
  ];

  documentColumns: CrudColumn[] = [
    { key: 'libelle', label: 'Libellé', type: 'text', required: true },
    { key: 'code', label: 'Code unique', type: 'text', required: true },
    { 
      key: 'modeGeneration', 
      label: 'Mode de génération', 
      type: 'enum', 
      required: true,
      options: [
        { value: 'TEMPLATE_ONLY', label: 'Modèle fixe (0€)' },
        { value: 'AI_HYBRID', label: 'IA Hybride (Corps IA)' },
        { value: 'AI_FULL', label: 'IA Totale (Libre)' }
      ]
    },
    { 
      key: 'contentTemplate', 
      label: 'Modèle de document', 
      type: 'textarea', 
      placeholder: "Saisissez ou collez le texte brut du modèle...",
      hideInTable: true
    },
    { 
      key: 'aiPromptTemplate', 
      label: 'Instructions IA', 
      type: 'textarea', 
      placeholder: "Générez un document RH professionnel pour...",
      hideInTable: true
    },
    { key: 'delaiTraitementJours', label: 'Délai (jours)', type: 'number', required: true },
    { key: 'maxDemandesParMois', label: 'Quota mensuel', type: 'number' }
  ];
}

