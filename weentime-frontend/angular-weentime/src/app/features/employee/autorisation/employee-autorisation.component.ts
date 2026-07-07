import { Component, OnInit, signal, computed, inject, DestroyRef, ChangeDetectionStrategy, ViewEncapsulation, effect, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Plus, ClipboardList, Clock, CheckCircle, Timer, Search, Info, Stethoscope, LogOut, AlarmClock, Laptop, Coffee, Hourglass, Loader2, Trash2, ChevronDown, X, Filter, Check } from 'lucide-angular';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AutorisationService } from '../../../core/services/autorisation.service';
import { Autorisation, StatsAutorisation, StatutAutorisation, TypeAutorisation } from '../../../core/models/autorisation.model';
import { AssistantSyncService } from '../../../core/services/assistant-sync.service';
import { AssistantWorkflowService } from '../../../core/services/assistant-workflow.service';
import { AutorisationHistoryComponent } from './components/autorisation-history/autorisation-history.component';
import { AutorisationFormComponent } from './components/autorisation-form/autorisation-form.component';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-employee-autorisation',
  standalone: true,
  imports: [
    CommonModule,
    LucideAngularModule,
    AutorisationHistoryComponent,
    AutorisationFormComponent
  ],
  template: `
    <div class="bento-container fade-in">
      <!-- Header Section -->
      <header class="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <h1 class="text-4xl font-black text-slate-900 dark:text-white tracking-tight mb-2">Mes Autorisations</h1>
          <p class="text-slate-500 dark:text-slate-400 font-medium leading-relaxed max-w-2xl">
            Gérez vos absences de courte durée (quelques heures) sans impact sur vos congés.
          </p>
        </div>
        
        <button 
          (click)="showForm.set(true)"
          class="action-button primary group"
        >
          <div class="button-content">
            <div class="icon-box">
              <lucide-angular [img]="iconPlus" size="20"></lucide-angular>
            </div>
            <span>Nouvelle demande</span>
          </div>
          <div class="button-glow"></div>
        </button>
      </header>

      <!-- Dashboard Grid -->
      <main class="bento-layout">
        
        <!-- KPI Row (Compact & Discret) -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <!-- Total -->
          <div class="bento-card compact-kpi group" style="--card-color: #6366f1">
            <div class="flex items-center gap-3">
              <div class="kpi-mini-icon">
                <lucide-angular [img]="iconList" size="18"></lucide-angular>
              </div>
              <div>
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Total demandes</span>
                <span class="text-lg font-black text-slate-800 dark:text-white leading-none mt-0.5 block">{{ kpis()?.total || 0 }}</span>
              </div>
            </div>
          </div>
          
          <!-- En attente -->
          <div class="bento-card compact-kpi group" style="--card-color: #f59e0b">
            <div class="flex items-center gap-3">
              <div class="kpi-mini-icon">
                <lucide-angular [img]="iconClock" size="18"></lucide-angular>
              </div>
              <div>
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">En attente</span>
                <span class="text-lg font-black text-slate-800 dark:text-white leading-none mt-0.5 block">{{ kpis()?.enAttente || 0 }}</span>
              </div>
            </div>
          </div>

          <!-- Approuvées -->
          <div class="bento-card compact-kpi group" style="--card-color: #10b981">
            <div class="flex items-center gap-3">
              <div class="kpi-mini-icon">
                <lucide-angular [img]="iconCheck" size="18"></lucide-angular>
              </div>
              <div>
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Approuvées</span>
                <span class="text-lg font-black text-slate-800 dark:text-white leading-none mt-0.5 block">{{ kpis()?.approuvees || 0 }}</span>
              </div>
            </div>
          </div>

          <!-- Seuil -->
          <div class="bento-card compact-kpi group" style="--card-color: #8b5cf6">
            <div class="flex items-center gap-3">
              <div class="kpi-mini-icon">
                <lucide-angular [img]="iconTimer" size="18"></lucide-angular>
              </div>
              <div>
                <span class="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">Demandes > 2h</span>
                <span class="text-lg font-black text-slate-800 dark:text-white leading-none mt-0.5 block">{{ kpis()?.seuil || 0 }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bento Grid Layout: 2 Columns -->
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mb-10">
          
          <!-- Left Column: Demande en cours -->
          <div class="lg:col-span-7 xl:col-span-8">
            <div class="bento-card main-section p-6 min-h-[300px] flex flex-col justify-between">
              <div>
                <h2 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                  <span class="w-2 h-6 bg-indigo-500 rounded-full"></span>
                  Ma demande en cours
                </h2>
                
                @if (demandeEnCours(); as item) {
                  <div class="pending-request-card p-5 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800/80 rounded-2xl">
                    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div class="flex items-center gap-4">
                        <div class="type-icon-wrapper" style="--icon-color: #6366f1">
                          <lucide-angular [img]="iconClock" size="20"></lucide-angular>
                        </div>
                        <div>
                          <h3 class="font-black text-slate-900 dark:text-white text-base">
                            {{ formatType(item.typeAutorisation) }}
                          </h3>
                          <p class="text-xs text-slate-400 dark:text-slate-500 font-semibold mt-1">
                            Déposée le {{ item.dateCreation | date:'dd MMM yyyy à HH:mm' }}
                          </p>
                        </div>
                      </div>
                      <div>
                        <span [class]="getStatusClass(item.statut)" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors">
                          <span class="w-1.5 h-1.5 rounded-full" [class]="getStatusDotClass(item.statut)"></span>
                          {{ formatStatut(item.statut) }}
                        </span>
                      </div>
                    </div>
                    
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-200/60 dark:border-slate-800/60">
                      <div>
                        <span class="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-1">Date d'absence</span>
                        <span class="text-sm font-bold text-slate-800 dark:text-slate-200">{{ item.dateAutorisation | date:'dd MMM yyyy' }}</span>
                      </div>
                      <div>
                        <span class="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-1">Horaires</span>
                        <span class="text-sm font-bold text-slate-800 dark:text-slate-200">
                          {{ item.heureDebut?.substring(0, 5) || '--:--' }} - {{ item.heureFin?.substring(0, 5) || '--:--' }}
                        </span>
                      </div>
                      <div class="col-span-2 sm:col-span-1">
                        <span class="text-[10px] uppercase font-black tracking-wider text-slate-400 block mb-1">Durée</span>
                        <span class="text-sm font-bold text-slate-800 dark:text-slate-200">{{ formatDuree(item.duree) }}</span>
                      </div>
                    </div>

                    @if (item.motif) {
                      <div class="mt-4 p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-xl flex gap-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                        <lucide-angular [img]="iconInfo" size="16" class="text-slate-400 flex-shrink-0 mt-0.5"></lucide-angular>
                        <p class="leading-relaxed">{{ item.motif }}</p>
                      </div>
                    }

                    @if (canCancel(item.statut)) {
                      <div class="mt-6 flex justify-end">
                        <button 
                          (click)="onCancelRequest(item)" 
                          [disabled]="cancellingId() === item.id"
                          class="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 hover:text-rose-700 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors border border-transparent hover:border-rose-200 dark:hover:border-rose-500/20"
                        >
                          @if (cancellingId() === item.id) {
                            <lucide-angular [img]="iconLoader" size="14" class="animate-spin"></lucide-angular>
                          } @else {
                            <lucide-angular [img]="iconTrash" size="14"></lucide-angular>
                          }
                          <span>Annuler la demande</span>
                        </button>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="flex flex-col items-center justify-center py-10 text-center bg-slate-50/50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl min-h-[200px]">
                    <div class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 flex items-center justify-center mb-4">
                      <lucide-angular [img]="iconCheck" size="24"></lucide-angular>
                    </div>
                    <h3 class="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1">Aucune demande en cours</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm px-4 leading-relaxed font-semibold">
                      Toutes vos demandes précédentes ont été traitées. Vous pouvez faire une nouvelle demande à tout moment.
                    </p>
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Right Column: Demander rapidement / Raccourcis -->
          <div class="lg:col-span-5 xl:col-span-4">
            <div class="bento-card main-section p-6 min-h-[300px]">
              <h2 class="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                <span class="w-2 h-6 bg-indigo-500 rounded-full"></span>
                Demander rapidement
              </h2>
              
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                @for (quickAction of quickActions; track quickAction.id) {
                  <button 
                    (click)="onQuickRequest(quickAction.id)"
                    class="quick-action-card group flex items-center gap-3 p-3.5 bg-slate-50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800/80 border border-slate-100 dark:border-slate-800/60 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 rounded-2xl transition-all duration-300 text-left w-full cursor-pointer hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-0.5"
                    [style.--card-color]="quickAction.rawColor"
                  >
                    <div class="quick-icon-box p-2 rounded-xl transition-colors" [class]="quickAction.bg + ' ' + quickAction.color">
                      <lucide-angular [img]="quickAction.icon" size="18"></lucide-angular>
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-xs font-black text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {{ quickAction.label }}
                      </div>
                      <div class="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5 truncate">
                        {{ quickAction.desc }}
                      </div>
                    </div>
                  </button>
                }
              </div>
            </div>
          </div>
        </div>

        <!-- History Section (Timeline) -->
        <section class="bento-card main-section history-section p-6 sm:p-8">
          <header class="history-section-header">
            <div class="history-section-heading">
              <div class="history-title-row">
                <span class="history-title-accent" aria-hidden="true"></span>
                <h2 class="history-section-title">Historique récent</h2>
              </div>
              <p class="history-section-subtitle">Retrouvez vos dernières demandes et leur statut</p>
            </div>

            <div class="history-actions" role="search">
              <div class="search-container" (click)="focusSearchInput($event)">
                <lucide-angular [img]="iconSearch" size="16" class="search-container-icon" aria-hidden="true"></lucide-angular>
                <input
                  #searchInput
                  type="text"
                  role="searchbox"
                  class="search-container-input"
                  placeholder="Rechercher une demande..."
                  autocomplete="off"
                  aria-label="Rechercher dans l'historique"
                  [value]="searchQuery()"
                  (input)="onSearchInput($event)"
                />
                @if (searchQuery()) {
                  <button
                    type="button"
                    class="search-container-clear"
                    aria-label="Effacer la recherche"
                    (click)="clearSearch($event)"
                  >
                    <lucide-angular [img]="iconClear" size="14"></lucide-angular>
                  </button>
                } @else {
                  <kbd class="search-container-kbd" aria-hidden="true">{{ searchShortcutLabel }}</kbd>
                }
              </div>

              <div #filterWrapper class="history-filter-wrapper">
                <button
                  type="button"
                  class="history-filter-box"
                  id="history-status-filter"
                  [class.is-active]="statusFilter() !== 'ALL'"
                  [class.is-open]="filterDropdownOpen()"
                  [attr.aria-expanded]="filterDropdownOpen()"
                  aria-haspopup="listbox"
                  (click)="toggleFilterDropdown($event)"
                  (keydown)="onFilterTriggerKeydown($event)"
                >
                  <lucide-angular [img]="iconFilter" size="15" class="history-filter-icon" aria-hidden="true"></lucide-angular>
                  <span class="history-filter-label">{{ statusFilterLabel() }}</span>
                  <lucide-angular
                    [img]="iconChevronDown"
                    size="14"
                    class="history-filter-chevron"
                    [class.is-open]="filterDropdownOpen()"
                    aria-hidden="true"
                  ></lucide-angular>
                </button>

                @if (filterDropdownOpen()) {
                  <ul
                    class="history-filter-menu"
                    role="listbox"
                    aria-labelledby="history-status-filter"
                  >
                    @for (option of statusFilterOptions; track option.value; let i = $index) {
                      <li
                        role="option"
                        class="history-filter-option"
                        [class.is-selected]="statusFilter() === option.value"
                        [class.is-focused]="focusedFilterIndex() === i"
                        [attr.aria-selected]="statusFilter() === option.value"
                        (click)="selectStatusFilter(option.value, $event)"
                        (mouseenter)="focusedFilterIndex.set(i)"
                      >
                        <span class="history-filter-option-check" aria-hidden="true">
                          @if (statusFilter() === option.value) {
                            <lucide-angular [img]="iconCheckMark" size="14"></lucide-angular>
                          }
                        </span>
                        {{ option.label }}
                      </li>
                    }
                  </ul>
                }
              </div>
            </div>
          </header>

          @if (hasActiveFilters() && !isLoading()) {
            <div class="history-feedback-bar" aria-live="polite">
              <div class="history-feedback-meta">
                <span class="history-feedback-count">
                  {{ filteredDemandes().length }} résultat{{ filteredDemandes().length !== 1 ? 's' : '' }}
                </span>
                @if (statusFilter() !== 'ALL') {
                  <span class="history-feedback-sep" aria-hidden="true">·</span>
                  <span class="history-feedback-filter">Filtre&nbsp;: {{ statusFilterLabel() }}</span>
                }
                @if (searchQuery().trim()) {
                  <span class="history-feedback-sep" aria-hidden="true">·</span>
                  <span class="history-feedback-search">«&nbsp;{{ searchQuery().trim() }}&nbsp;»</span>
                }
              </div>
              <button type="button" class="history-feedback-clear" (click)="clearHistoryFilters()">
                Effacer
              </button>
            </div>
          }

          @if (!isLoading() && demandes().length > 0 && filteredDemandes().length === 0) {
            <div class="history-no-results">
              <div class="history-no-results-icon">
                <lucide-angular [img]="iconSearch" size="22"></lucide-angular>
              </div>
              <h3>Aucun résultat</h3>
              <p>Aucune demande ne correspond à votre recherche ou au filtre sélectionné.</p>
              <button type="button" class="history-clear-filters history-clear-filters--cta" (click)="clearHistoryFilters()">
                Effacer les filtres
              </button>
            </div>
          } @else {
            <app-autorisation-history
              [demandes]="filteredDemandes()"
              [cancellingId]="cancellingId()"
              [class.opacity-50]="isLoading()"
              (cancelRequest)="onCancelRequest($event)"
            ></app-autorisation-history>
          }
        </section>
      </main>

      <!-- Adaptive Form Component -->
      @if (showForm()) {
        <app-autorisation-form 
          [defaultType]="selectedType()"
          (close)="onCloseForm()"
          (submitted)="onSubmitted()"
        ></app-autorisation-form>
      }
    </div>
  `,
  styles: [`
    .bento-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 2rem;
    }

    .fade-in {
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* --- Common Bento Card --- */
    .bento-card {
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.5);
      border-radius: 24px;
      box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.05);
      position: relative;
      overflow: hidden;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

      &.main-section {
        background: rgba(255, 255, 255, 0.95);
        border-color: rgba(241, 245, 249, 0.8);
      }

      &.history-section {
        overflow: visible;
      }
    }

    .dark .bento-card {
      background: rgba(15, 23, 42, 0.6);
      border-color: rgba(255, 255, 255, 0.05);
      
      &.main-section {
        background: rgba(15, 23, 42, 0.8);
        border-color: rgba(255, 255, 255, 0.05);
      }
    }

    /* --- Compact KPI cards --- */
    .compact-kpi {
      padding: 1.15rem 1.25rem;
      border-radius: 20px;
      background: rgba(255, 255, 255, 0.7);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(241, 245, 249, 0.8);
      box-shadow: 0 4px 20px -5px rgba(0, 0, 0, 0.02);

      &:hover {
        transform: translateY(-1px);
        border-color: rgba(99, 102, 241, 0.2);
        box-shadow: 0 10px 20px -10px rgba(99, 102, 241, 0.05);
      }

      .kpi-mini-icon {
        width: 38px;
        height: 38px;
        border-radius: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--card-color) 10%, white);
        color: var(--card-color);
      }
    }

    .dark .compact-kpi {
      background: rgba(15, 23, 42, 0.4);
      border-color: rgba(255, 255, 255, 0.02);

      &:hover {
        border-color: rgba(99, 102, 241, 0.2);
      }

      .kpi-mini-icon {
        background: color-mix(in srgb, var(--card-color) 15%, transparent);
      }
    }

    /* --- Quick Action Cards --- */
    .quick-action-card {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      
      .quick-icon-box {
        background: rgba(0, 0, 0, 0.03);
      }
      
      &:hover {
        background: white;
        border-color: rgba(99, 102, 241, 0.25);
        
        .quick-icon-box {
          background: color-mix(in srgb, var(--card-color, #6366f1) 12%, white);
        }
      }
    }
    
    .dark .quick-action-card {
      background: rgba(15, 23, 42, 0.3);
      border-color: rgba(255, 255, 255, 0.02);
      
      &:hover {
        background: rgba(30, 41, 59, 0.4);
        border-color: rgba(99, 102, 241, 0.25);
        
        .quick-icon-box {
          background: color-mix(in srgb, var(--card-color, #6366f1) 15%, transparent);
        }
      }
    }

    /* --- Action Button --- */
    .action-button {
      position: relative;
      padding: 12px 24px;
      border-radius: 16px;
      font-weight: 700;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      overflow: hidden;

      &.primary {
        background: #4f46e5;
        color: white;
        box-shadow: 0 10px 20px -5px rgba(79, 70, 229, 0.3);
        
        .icon-box {
          background: rgba(255,255,255,0.2);
        }

        &:hover {
          background: #4338ca;
          transform: translateY(-2px);
          box-shadow: 0 15px 25px -5px rgba(79, 70, 229, 0.4);
        }
      }

      .button-content {
        position: relative;
        z-index: 1;
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .icon-box {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    }

    .type-icon-wrapper {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--icon-color, #6366f1) 10%, white);
      color: var(--icon-color, #6366f1);
      box-shadow: 0 2px 8px rgba(0,0,0,0.02);
    }

    .dark .type-icon-wrapper {
      background: color-mix(in srgb, var(--icon-color, #6366f1) 15%, transparent);
    }

    /* --- History section header (mockup) --- */
    .history-section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem 2rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .history-section-heading {
      flex: 0 1 auto;
      min-width: 0;
    }

    .history-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .history-section-title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0f172a;
      line-height: 1.2;
    }

    .dark .history-section-title {
      color: #f8fafc;
    }

    .history-section-subtitle {
      margin: 0.4rem 0 0;
      padding-left: calc(8px + 0.75rem);
      font-size: 0.875rem;
      font-weight: 500;
      color: #64748b;
      line-height: 1.45;
    }

    .dark .history-section-subtitle {
      color: #94a3b8;
    }

    .history-title-accent {
      width: 8px;
      height: 2rem;
      border-radius: 999px;
      background: #6366f1;
      flex-shrink: 0;
    }

    .history-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex: 1 1 380px;
      justify-content: flex-end;
      min-width: 0;
    }

    .search-container,
    .history-filter-box {
      height: 44px;
      box-sizing: border-box;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

    .search-container:focus-within,
    .history-filter-box:focus-visible,
    .history-filter-box.is-open {
      background: #ffffff;
      border-color: #6366f1;
      box-shadow:
        0 0 0 3px rgba(99, 102, 241, 0.12),
        0 1px 2px rgba(15, 23, 42, 0.04);
    }

    .dark .search-container,
    .dark .history-filter-box {
      background: rgba(30, 41, 59, 0.45);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .dark .search-container:focus-within,
    .dark .history-filter-box:focus-visible,
    .dark .history-filter-box.is-open {
      background: rgba(15, 23, 42, 0.65);
      border-color: #818cf8;
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }

    .search-container {
      flex: 1 1 auto;
      max-width: 400px;
      min-width: 220px;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.75rem 0 0.875rem;
    }

    .history-filter-wrapper {
      position: relative;
      flex-shrink: 0;
    }

    .history-filter-box {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0 0.75rem 0 0.875rem;
      min-width: 168px;
      margin: 0;
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      outline: none;
    }

    .history-filter-box.is-open {
      background: #ffffff;
      border-color: #6366f1;
      box-shadow:
        0 0 0 3px rgba(99, 102, 241, 0.12),
        0 1px 2px rgba(15, 23, 42, 0.04);
    }

    .history-filter-box.is-open .history-filter-chevron {
      color: #6366f1;
    }

    .dark .history-filter-box.is-open {
      background: rgba(15, 23, 42, 0.65);
    }

    .history-filter-box.is-active {
      background: #eef2ff;
      border-color: #6366f1;
    }

    .history-filter-box.is-active .history-filter-icon,
    .history-filter-box.is-active .history-filter-chevron {
      color: #6366f1;
    }

    .history-filter-box.is-active .history-filter-label {
      color: #4338ca;
      font-weight: 700;
    }

    .history-filter-box.is-active:focus-within {
      background: #eef2ff;
    }

    .dark .history-filter-box.is-active {
      background: rgba(49, 46, 129, 0.25);
      border-color: #818cf8;
    }

    .dark .history-filter-box.is-active .history-filter-label {
      color: #a5b4fc;
    }

    .history-filter-box:hover:not(.is-active) {
      background: #f1f5f9;
    }

    .dark .history-filter-box:hover:not(.is-active) {
      background: rgba(30, 41, 59, 0.65);
    }

    .search-container-icon {
      color: #94a3b8;
      flex-shrink: 0;
      pointer-events: none;
    }

    .search-container-input {
      flex: 1;
      min-width: 0;
      height: 100%;
      margin: 0;
      padding: 0;
      border: none;
      outline: none;
      box-shadow: none;
      background: transparent;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      color: #0f172a;
      appearance: none;
      -webkit-appearance: none;
    }

    .search-container-input::placeholder {
      color: #94a3b8;
    }

    .search-container-input:focus {
      outline: none;
      box-shadow: none;
      border: none;
    }

    .dark .search-container-input {
      color: #f1f5f9;
    }

    .search-container-kbd {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 22px;
      padding: 0 0.45rem;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.85);
      border: 1px solid #e2e8f0;
      font-family: inherit;
      font-size: 0.6875rem;
      font-weight: 600;
      color: #94a3b8;
      line-height: 1;
      pointer-events: none;
    }

    .dark .search-container-kbd {
      background: rgba(15, 23, 42, 0.5);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .search-container-clear {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      margin: 0;
      padding: 0;
      border: none;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      transition: background-color 0.15s ease, color 0.15s ease;
    }

    .search-container-clear:hover {
      background: rgba(99, 102, 241, 0.08);
      color: #6366f1;
    }

    .search-container-clear:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 1px;
    }

    .history-filter-icon {
      color: #64748b;
      flex-shrink: 0;
    }

    .history-filter-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #475569;
      white-space: nowrap;
      pointer-events: none;
    }

    .dark .history-filter-label {
      color: #cbd5e1;
    }

    .history-filter-chevron {
      color: #94a3b8;
      flex-shrink: 0;
      pointer-events: none;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s ease;
    }

    .history-filter-chevron.is-open {
      transform: rotate(180deg);
    }

    .history-filter-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 100%;
      width: max(100%, 196px);
      margin: 0;
      padding: 6px;
      list-style: none;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow:
        0 8px 24px rgba(15, 23, 42, 0.08),
        0 2px 8px rgba(15, 23, 42, 0.04);
      z-index: 50;
      transform-origin: top right;
      animation: historyFilterMenuIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    @keyframes historyFilterMenuIn {
      from {
        opacity: 0;
        transform: translateY(-6px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .dark .history-filter-menu {
      background: #1e293b;
      border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }

    .history-filter-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
      border-radius: 8px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: background-color 0.12s ease, color 0.12s ease;
      user-select: none;
    }

    .history-filter-option-check {
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: #6366f1;
    }

    .history-filter-option:hover,
    .history-filter-option.is-focused {
      background: #f8fafc;
      color: #0f172a;
    }

    .history-filter-option.is-selected {
      background: #eef2ff;
      color: #4338ca;
    }

    .history-filter-option.is-selected:hover,
    .history-filter-option.is-selected.is-focused {
      background: #e0e7ff;
      color: #4338ca;
    }

    .dark .history-filter-option {
      color: #cbd5e1;
    }

    .dark .history-filter-option:hover,
    .dark .history-filter-option.is-focused {
      background: rgba(255, 255, 255, 0.06);
      color: #f1f5f9;
    }

    .dark .history-filter-option.is-selected {
      background: rgba(99, 102, 241, 0.18);
      color: #a5b4fc;
    }

    .history-feedback-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin: -0.5rem 0 1.25rem;
      padding: 0.625rem 0.875rem;
      border-radius: 10px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }

    .dark .history-feedback-bar {
      background: rgba(30, 41, 59, 0.35);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .history-feedback-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
      min-width: 0;
    }

    .history-feedback-count {
      font-size: 0.8125rem;
      font-weight: 700;
      color: #0f172a;
    }

    .dark .history-feedback-count {
      color: #f1f5f9;
    }

    .history-feedback-sep {
      color: #cbd5e1;
      font-weight: 600;
    }

    .history-feedback-filter {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #4338ca;
    }

    .dark .history-feedback-filter {
      color: #a5b4fc;
    }

    .history-feedback-search {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #64748b;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .history-feedback-clear {
      flex-shrink: 0;
      border: none;
      background: transparent;
      font-family: inherit;
      font-size: 0.8125rem;
      font-weight: 700;
      color: #6366f1;
      cursor: pointer;
      padding: 0.35rem 0.5rem;
      border-radius: 8px;
      transition: background-color 0.15s ease;
    }

    .history-feedback-clear:hover {
      background: rgba(99, 102, 241, 0.08);
    }

    .history-feedback-clear:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }

    .history-clear-filters {
      border: none;
      background: transparent;
      font-family: inherit;
      font-size: 0.75rem;
      font-weight: 700;
      color: #6366f1;
      cursor: pointer;
      padding: 0.35rem 0.5rem;
      border-radius: 8px;
      transition: background-color 0.15s ease;
    }

    .history-clear-filters:hover {
      background: rgba(99, 102, 241, 0.08);
    }

    .history-clear-filters:focus-visible {
      outline: 2px solid #6366f1;
      outline-offset: 2px;
    }

    .history-no-results {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 3rem 1.5rem;
      border-radius: 20px;
      background: #f8fafc;
      border: 1px dashed rgba(148, 163, 184, 0.35);
    }

    .dark .history-no-results {
      background: rgba(15, 23, 42, 0.35);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .history-no-results-icon {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(99, 102, 241, 0.08);
      color: #6366f1;
      margin-bottom: 1rem;
    }

    .history-no-results h3 {
      margin: 0 0 0.35rem;
      font-size: 1.05rem;
      font-weight: 800;
      color: #0f172a;
    }

    .dark .history-no-results h3 {
      color: #f1f5f9;
    }

    .history-no-results p {
      margin: 0 0 1rem;
      max-width: 320px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: #64748b;
      line-height: 1.5;
    }

    .history-clear-filters--cta {
      padding: 0.55rem 1rem;
      background: #6366f1;
      color: #ffffff;
      border-radius: 10px;
    }

    .history-clear-filters--cta:hover {
      background: #4f46e5;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (max-width: 900px) {
      .history-section-header {
        flex-direction: column;
        align-items: stretch;
      }

      .history-actions {
        flex: 1 1 auto;
        justify-content: stretch;
      }

      .search-container {
        max-width: none;
      }
    }

    @media (max-width: 520px) {
      .history-actions {
        flex-direction: column;
        align-items: stretch;
      }

      .search-container,
      .history-filter-box {
        width: 100%;
        min-width: 0;
      }

      .history-filter-box {
        justify-content: flex-start;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class EmployeeAutorisationComponent implements OnInit {
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('filterWrapper') filterWrapper?: ElementRef<HTMLElement>;

  private service = inject(AutorisationService);
  private destroyRef = inject(DestroyRef);
  private toastService = inject(ToastService);
  private assistantWorkflow = inject(AssistantWorkflowService);
  private assistantSync = inject(AssistantSyncService);

  readonly searchShortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.userAgent)
    ? '⌘K'
    : 'Ctrl+K';

  demandes = signal<Autorisation[]>([]);
  kpis = signal<StatsAutorisation | null>(null);
  isLoading = signal(true);
  showForm = signal(false);
  cancellingId = signal<number | null>(null);
  searchQuery = signal('');
  statusFilter = signal<HistoryStatusFilter>('ALL');
  filterDropdownOpen = signal(false);
  focusedFilterIndex = signal(0);

  selectedType = signal<string | null>(null);

  readonly statusFilterOptions: ReadonlyArray<{ value: HistoryStatusFilter; label: string }> = [
    { value: 'ALL', label: 'Tous les statuts' },
    { value: 'PENDING', label: 'En attente' },
    { value: 'APPROVED', label: 'Approuvées' },
    { value: 'REJECTED', label: 'Refusées' },
  ];

  filteredDemandes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    let list = this.demandes();

    if (status !== 'ALL') {
      list = list.filter(d => {
        switch (status) {
          case 'PENDING':
            return this.isPendingStatus(d.statut);
          case 'APPROVED':
            return this.isApprovedStatus(d.statut);
          case 'REJECTED':
            return this.isRejectedStatus(d.statut);
          default:
            return true;
        }
      });
    }

    if (!query) {
      return list;
    }

    return list.filter(d => this.getSearchableText(d).includes(query));
  });

  statusFilterLabel = computed(() => {
    switch (this.statusFilter()) {
      case 'PENDING':
        return 'En attente';
      case 'APPROVED':
        return 'Approuvées';
      case 'REJECTED':
        return 'Refusées';
      default:
        return 'Tous les statuts';
    }
  });

  hasActiveFilters = computed(() =>
    this.searchQuery().trim().length > 0 || this.statusFilter() !== 'ALL'
  );

  demandeEnCours = computed(() => this.demandes().find(d => 
    d.statut === StatutAutorisation.EN_ATTENTE_MANAGER || 
    d.statut === StatutAutorisation.EN_ATTENTE_RH ||
    d.statut === StatutAutorisation.EN_ATTENTE ||
    d.statut === StatutAutorisation.PENDING ||
    d.statut === StatutAutorisation.PENDING_MANAGER ||
    d.statut === StatutAutorisation.PENDING_RH
  ));

  // Icons
  readonly iconPlus = Plus;
  readonly iconList = ClipboardList;
  readonly iconClock = Clock;
  readonly iconCheck = CheckCircle;
  readonly iconTimer = Timer;
  readonly iconSearch = Search;
  readonly iconClear = X;
  readonly iconFilter = Filter;
  readonly iconCheckMark = Check;
  readonly iconChevronDown = ChevronDown;
  readonly iconInfo = Info;
  readonly iconLoader = Loader2;
  readonly iconTrash = Trash2;

  readonly quickActions = [
    { id: 'RDV MEDICAL', label: 'RDV Médical', icon: Stethoscope, bg: 'bg-rose-50 dark:bg-rose-500/10', color: 'text-rose-600 dark:text-rose-400', rawColor: '#f43f5e', desc: 'Consultation ou soin' },
    { id: 'SORTIE ANTICIPEE', label: 'Sortie anticipée', icon: LogOut, bg: 'bg-amber-50 dark:bg-amber-500/10', color: 'text-amber-600 dark:text-amber-400', rawColor: '#f59e0b', desc: 'Quitter plus tôt' },
    { id: 'ARRIVEE TARDIVE', label: 'Arrivée tardive', icon: AlarmClock, bg: 'bg-blue-50 dark:bg-blue-500/10', color: 'text-blue-600 dark:text-blue-400', rawColor: '#3b82f6', desc: 'Retard prévu' },
    { id: 'TELETRAVAIL EXCEPTIONNEL', label: 'Télétravail exp.', icon: Laptop, bg: 'bg-indigo-50 dark:bg-indigo-500/10', color: 'text-indigo-600 dark:text-indigo-400', rawColor: '#6366f1', desc: 'Travail à distance' },
    { id: 'PAUSE LONGUE', label: 'Pause longue', icon: Coffee, bg: 'bg-emerald-50 dark:bg-emerald-500/10', color: 'text-emerald-600 dark:text-emerald-400', rawColor: '#10b981', desc: 'Pause prolongée' },
    { id: 'MI TEMPS EXCEPTIONNEL', label: 'Mi-temps exp.', icon: Hourglass, bg: 'bg-violet-50 dark:bg-violet-500/10', color: 'text-violet-600 dark:text-violet-400', rawColor: '#8b5cf6', desc: 'Justificatif requis' }
  ];

  constructor() {
    effect(() => {
      const draft = this.assistantWorkflow.authorizationDraft();
      if (draft?.autoOpen) {
        this.showForm.set(true);
      }
    });
  }

  ngOnInit(): void {
    this.loadData();
    this.loadKPIs();
    this.assistantSync.events$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(event => {
        if (event.actionResult?.executed && event.actionResult.tool === 'create_authorization') {
          this.loadData();
          this.loadKPIs();
        }
      });
  }

  loadData() {
    this.isLoading.set(true);
    this.service.getMesDemandes(0, 100) // Large size for now
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.demandes.set(res.content);
          this.isLoading.set(false);
        },
        error: () => this.isLoading.set(false)
      });
  }

  loadKPIs() {
    this.service.getEmployeeKPIs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(res => this.kpis.set(res));
  }

  onSubmitted() {
    this.onCloseForm();
    this.loadData();
    this.loadKPIs();
  }

  onQuickRequest(type: string): void {
    this.selectedType.set(type);
    this.showForm.set(true);
  }

  onCloseForm(): void {
    this.showForm.set(false);
    this.selectedType.set(null);
  }

  @HostListener('document:keydown', ['$event'])
  handleDocumentKeydown(event: KeyboardEvent): void {
    if (this.filterDropdownOpen()) {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.closeFilterDropdown();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.focusedFilterIndex.update(i =>
          Math.min(i + 1, this.statusFilterOptions.length - 1)
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.focusedFilterIndex.update(i => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const option = this.statusFilterOptions[this.focusedFilterIndex()];
        if (option) {
          this.selectStatusFilter(option.value);
        }
        return;
      }
    }

    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    event.preventDefault();
    this.searchInput?.nativeElement.focus();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.filterDropdownOpen()) {
      return;
    }
    const target = event.target as Node;
    if (this.filterWrapper?.nativeElement.contains(target)) {
      return;
    }
    this.closeFilterDropdown();
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  toggleFilterDropdown(event: Event): void {
    event.stopPropagation();
    if (this.filterDropdownOpen()) {
      this.closeFilterDropdown();
      return;
    }
    const currentIndex = this.statusFilterOptions.findIndex(o => o.value === this.statusFilter());
    this.focusedFilterIndex.set(currentIndex >= 0 ? currentIndex : 0);
    this.filterDropdownOpen.set(true);
  }

  onFilterTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.filterDropdownOpen()) {
        this.toggleFilterDropdown(event);
      }
    }
    if (event.key === 'Escape' && this.filterDropdownOpen()) {
      event.preventDefault();
      this.closeFilterDropdown();
    }
  }

  selectStatusFilter(value: HistoryStatusFilter, event?: Event): void {
    event?.stopPropagation();
    this.statusFilter.set(value);
    this.closeFilterDropdown();
  }

  closeFilterDropdown(): void {
    this.filterDropdownOpen.set(false);
  }

  clearSearch(event?: Event): void {
    event?.stopPropagation();
    this.searchQuery.set('');
    queueMicrotask(() => this.searchInput?.nativeElement.focus());
  }

  focusSearchInput(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.search-container-clear')) {
      return;
    }
    this.searchInput?.nativeElement.focus();
  }

  clearHistoryFilters(): void {
    this.searchQuery.set('');
    this.statusFilter.set('ALL');
    this.closeFilterDropdown();
  }

  private getSearchableText(demande: Autorisation): string {
    return [
      this.formatType(demande.typeAutorisation),
      demande.typeAutorisation,
      demande.motif,
      demande.commentaireValidateur,
      this.formatStatut(demande.statut),
      demande.dateAutorisation,
      demande.heureDebut,
      demande.heureFin
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  private isPendingStatus(statut: StatutAutorisation): boolean {
    return statut === StatutAutorisation.EN_ATTENTE_MANAGER ||
      statut === StatutAutorisation.EN_ATTENTE_RH ||
      statut === StatutAutorisation.EN_ATTENTE ||
      statut === StatutAutorisation.PENDING ||
      statut === StatutAutorisation.PENDING_MANAGER ||
      statut === StatutAutorisation.PENDING_RH;
  }

  private isApprovedStatus(statut: StatutAutorisation): boolean {
    return statut === StatutAutorisation.APPROUVE ||
      statut === StatutAutorisation.APPROVED ||
      statut === StatutAutorisation.VALIDEE;
  }

  private isRejectedStatus(statut: StatutAutorisation): boolean {
    return statut === StatutAutorisation.REFUSE ||
      statut === StatutAutorisation.REFUSEE ||
      statut === StatutAutorisation.REJECTED;
  }

  onCancelRequest(demande: Autorisation): void {
    if (this.cancellingId() || !window.confirm('Annuler cette demande d\'autorisation ?')) {
      return;
    }

    this.cancellingId.set(demande.id);
    this.service.annulerDemande(demande.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.cancellingId.set(null);
          this.toastService.success('Demande annulée avec succès');
          this.demandes.update(list => list.map(item => item.id === updated.id ? updated : item));
          this.loadKPIs();
        },
        error: () => {
          this.cancellingId.set(null);
        }
      });
  }

  formatType(type: TypeAutorisation): string {
    const types: Record<string, string> = {
      'SORTIE_ANTICIPEE': 'Sortie anticipée',
      'ARRIVEE_TARDIVE': 'Arrivée tardive',
      'RDV_MEDICAL': 'RDV Médical',
      'PAUSE_LONGUE': 'Pause longue',
      'TELETRAVAIL_EXCEPTIONNEL': 'Télétravail exp.',
      'MI_TEMPS_EXCEPTIONNEL': 'Mi-temps exp.',
      'AUTRE': 'Autre'
    };
    return types[type] || type;
  }

  formatStatut(statut: StatutAutorisation): string {
    const statuts: Record<string, string> = {
      'EN_ATTENTE_MANAGER': 'Attente Manager',
      'EN_ATTENTE_RH': 'Attente RH',
      'EN_ATTENTE': 'En attente',
      'PENDING': 'En attente',
      'PENDING_MANAGER': 'Attente Manager',
      'PENDING_RH': 'Attente RH',
      'APPROUVE': 'Approuvé',
      'APPROVED': 'Approuvé',
      'VALIDEE': 'Approuvé',
      'REFUSE': 'Refusé',
      'REFUSEE': 'Refusé',
      'REJECTED': 'Refusé',
      'ANNULE': 'Annulé',
      'CANCELLED': 'Annulé'
    };
    return statuts[statut] || statut;
  }

  getStatusClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER:
      case StatutAutorisation.EN_ATTENTE:
      case StatutAutorisation.PENDING:
      case StatutAutorisation.PENDING_MANAGER:
        return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20';
      case StatutAutorisation.EN_ATTENTE_RH:
      case StatutAutorisation.PENDING_RH:
        return 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-500/20';
      case StatutAutorisation.APPROUVE:
      case StatutAutorisation.APPROVED:
      case StatutAutorisation.VALIDEE:
        return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20';
      case StatutAutorisation.REFUSE:
      case StatutAutorisation.REFUSEE:
      case StatutAutorisation.REJECTED:
        return 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/20';
      default:
        return 'bg-slate-50 dark:bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-500/20';
    }
  }

  getStatusDotClass(statut: StatutAutorisation): string {
    switch (statut) {
      case StatutAutorisation.EN_ATTENTE_MANAGER:
      case StatutAutorisation.EN_ATTENTE:
      case StatutAutorisation.PENDING:
      case StatutAutorisation.PENDING_MANAGER:
        return 'bg-amber-500';
      case StatutAutorisation.EN_ATTENTE_RH:
      case StatutAutorisation.PENDING_RH:
        return 'bg-indigo-500';
      case StatutAutorisation.APPROUVE:
      case StatutAutorisation.APPROVED:
      case StatutAutorisation.VALIDEE:
        return 'bg-emerald-500';
      case StatutAutorisation.REFUSE:
      case StatutAutorisation.REFUSEE:
      case StatutAutorisation.REJECTED:
        return 'bg-rose-500';
      default:
        return 'bg-slate-500';
    }
  }

  formatDuree(minutes: number): string {
    if (!minutes) return '0min';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}min`;
    return `${h}h ${m.toString().padStart(2, '0')}min`;
  }

  canCancel(statut: StatutAutorisation): boolean {
    return this.isPendingStatus(statut);
  }
}

type HistoryStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
