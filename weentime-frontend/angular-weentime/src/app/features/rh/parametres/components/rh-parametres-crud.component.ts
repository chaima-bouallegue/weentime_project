import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal, HostListener, ViewChild, ElementRef, DestroyRef, effect, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideAngularModule,
  Check,
  AlertCircle,
  X,
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  ChevronDown,
  Loader2
} from 'lucide-angular';
import { environment } from '../../../../../environments/environment';
import { DocumentTemplateEditorComponent } from './document-template-editor.component';

export interface CrudColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'enum' | 'textarea';
  options?: { value: string, label: string }[]; // For enum
  required?: boolean;
  placeholder?: string;
  hideInTable?: boolean; // Hide column from table view (still shown in edit modal)
}

@Component({
  selector: 'app-rh-parametres-crud',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule,
    DocumentTemplateEditorComponent
  ],
  template: `
    <div class="flex flex-col gap-8 animate-in fade-in duration-700"
         [class.shell-blurred]="isModalOpen() || isDeleteModalOpen()">

      <!-- Toolbar Premium -->
      <div class="flex flex-col gap-4">
        <!-- Global Feedback Message -->
        @if (status()) {
          <div class="animate-in slide-in-from-top-4 duration-500 px-8 py-5 rounded-[2rem] flex items-center justify-between gap-4 border shadow-2xl backdrop-blur-xl"
               [ngClass]="status()?.type === 'success'
                ? 'bg-emerald-50/90 border-emerald-100 text-emerald-800'
                : 'bg-rose-50/90 border-rose-100 text-rose-800'">
            <div class="flex items-center gap-4">
              <div class="p-2 rounded-xl" [ngClass]="status()?.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'">
                <lucide-icon [img]="status()?.type === 'success' ? CheckIcon : AlertIcon" size="20"></lucide-icon>
              </div>
              <span class="text-sm font-black tracking-tight">{{ status()?.message }}</span>
            </div>
            <button (click)="status.set(null)" class="p-2 hover:bg-black/5 rounded-xl transition-colors">
              <lucide-icon [img]="XIcon" size="18"></lucide-icon>
            </button>
          </div>
        }

        <div class="flex flex-col sm:flex-row items-center justify-between bg-white dark:bg-slate-800 p-8 rounded-[2rem] border border-slate-200/60 dark:border-slate-700/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none gap-6 transition-all duration-300">
          <div class="flex items-center gap-4">
            <div class="w-1.5 h-10 bg-indigo-600 rounded-full"></div>
            <div>
              <h3 class="text-2xl font-black text-slate-800 dark:text-white tracking-tighter">
                Liste des <span class="text-indigo-600 dark:text-indigo-400">{{ title }}</span>
              </h3>
              <p class="text-xs font-bold text-slate-400 mt-0.5 tracking-tight uppercase">Interface de gestion administrative</p>
            </div>
          </div>
          <button (click)="openModal()" class="group flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-slate-900 dark:hover:bg-white dark:hover:text-slate-900 text-white rounded-2xl text-sm font-black transition-all shadow-xl shadow-indigo-200/50 dark:shadow-none active:scale-95 hover:-translate-y-0.5">
            <lucide-icon [img]="PlusIcon" size="20" class="group-hover:rotate-90 transition-transform duration-500"></lucide-icon>
            NOUVEL ÉLÉMENT
          </button>
        </div>
      </div>

      <!-- Table Container Premium -->
      <div class="bg-white dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.03)] dark:shadow-none">
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
            <tr class="bg-slate-50/50 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-700/60">
              @for (col of tableColumns; track col.key) {
                <th class="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{{ col.label }}</th>
              }
              <th class="px-8 py-6 text-right text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Actions</th>
            </tr>
            </thead>
            <tbody class="divide-y divide-slate-50 dark:divide-slate-700/30">
              @if (loading()) {
                <tr>
                  <td [colSpan]="columns.length + 1" class="px-8 py-24 text-center">
                    <div class="flex flex-col items-center gap-4">
                      <div class="relative w-16 h-16">
                        <div class="absolute inset-0 border-4 border-indigo-100 dark:border-slate-700 rounded-full"></div>
                        <div class="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                      <span class="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.3em] animate-pulse">Synchronisation...</span>
                    </div>
                  </td>
                </tr>
              } @else if (data().length === 0) {
                <tr>
                  <td [colSpan]="columns.length + 1" class="px-8 py-24 text-center">
                    <div class="flex flex-col items-center gap-4 group">
                      <div class="w-20 h-20 bg-slate-50 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-200 dark:text-slate-700 group-hover:scale-110 transition-transform duration-500">
                        <lucide-icon [img]="FolderIcon" size="40"></lucide-icon>
                      </div>
                      <span class="text-xs font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest italic">Aucun enregistrement trouvé</span>
                    </div>
                  </td>
                </tr>
              } @else {
                @for (item of data(); track item.id) {
                  <tr class="hover:bg-slate-50/50 dark:hover:bg-indigo-500/5 transition-all duration-300 group">
                    @for (col of tableColumns; track col.key) {
                      <td class="px-8 py-6 whitespace-nowrap">
                        @if (col.type === 'boolean') {
                          <div class="flex items-center">
                            @if (item[col.key]) {
                              <span class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20 shadow-sm">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                                ACTIF
                              </span>
                            } @else {
                              <span class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 border border-slate-100 dark:bg-slate-700/50 dark:text-slate-500 dark:border-slate-600 shadow-sm">
                                <span class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600"></span>
                                INACTIF
                              </span>
                            }
                          </div>
                        } @else if (col.type === 'enum' && col.options) {
                          <span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black tracking-wide border shadow-sm"
                                [ngClass]="{
                                  'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-500/10 dark:text-violet-400 dark:border-violet-500/20': item[col.key] === 'AI_FULL',
                                  'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20': item[col.key] === 'AI_HYBRID',
                                  'bg-sky-50 text-sky-600 border-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20': item[col.key] === 'TEMPLATE_ONLY',
                                  'bg-slate-50 text-slate-500 border-slate-100 dark:bg-slate-700/50 dark:text-slate-400 dark:border-slate-600': item[col.key] !== 'AI_FULL' && item[col.key] !== 'AI_HYBRID' && item[col.key] !== 'TEMPLATE_ONLY'
                                }">
                            {{ getEnumLabel(col, item[col.key]) }}
                          </span>
                        } @else if (col.type === 'number') {
                          <div class="inline-flex items-center justify-center min-w-[2.5rem] h-8 px-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400 font-black font-mono border border-indigo-100 dark:border-indigo-500/20">
                            {{ item[col.key] || '0' }}
                          </div>
                        } @else if (col.type === 'textarea') {
                          @if (item[col.key]) {
                            <span class="inline-flex items-center gap-1.5 max-w-[180px] px-3 py-1.5 bg-slate-50 dark:bg-slate-700/30 border border-slate-100 dark:border-slate-600/40 rounded-xl text-[10px] font-bold text-slate-500 dark:text-slate-400 truncate cursor-default" [title]="'Cliquer Modifier pour voir le contenu complet'">
                              📄 {{ item[col.key].substring(0, 40) }}{{ item[col.key].length > 40 ? '…' : '' }}
                            </span>
                          } @else {
                            <span class="text-slate-300 dark:text-slate-600 text-xs italic">—</span>
                          }
                        } @else {
                          <span class="font-bold text-slate-600 dark:text-slate-300 tracking-tight">{{ item[col.key] || '-' }}</span>
                        }
                      </td>
                    }
                    <td class="px-8 py-6 text-right">
                      <div class="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-4 group-hover:translate-x-0">
                        <button (click)="openModal(item)" class="p-3 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600 active:scale-90" title="Modifier">
                          <lucide-icon [img]="EditIcon" size="18"></lucide-icon>
                        </button>
                        <button (click)="confirmDelete(item.id)" class="p-3 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-white dark:hover:bg-slate-700 rounded-2xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600 active:scale-90" title="Supprimer">
                          <lucide-icon [img]="TrashIcon" size="18"></lucide-icon>
                        </button>
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- Modal Premium -->
    @if (isModalOpen()) {
      <!-- Overlay = backdrop + flex container (pattern structure RH) -->
      <div role="dialog" aria-modal="true" [attr.aria-label]="(isEditMode() ? 'Modifier' : 'Ajouter') + ' un élément'"
           (click)="closeModal()"
           class="modal-overlay">

        <div class="modal-content" (click)="$event.stopPropagation()">

          <!-- Modal Header -->
          <div class="flex-shrink-0 relative px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                  {{ isEditMode() ? 'Modifier' : 'Ajouter' }} <span class="text-indigo-600 dark:text-indigo-400">un élément</span>
                </h3>
                <p class="text-xs font-medium text-slate-400 mt-1">Remplissez les informations ci-dessous</p>
              </div>
              <button (click)="closeModal()" class="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:rotate-90 transition-all border border-slate-100 dark:border-slate-700" aria-label="Fermer">
                <lucide-icon [img]="XIcon" size="20"></lucide-icon>
              </button>
            </div>
          </div>

          <!-- Modal Body -->
          <form #modalForm [formGroup]="form" (ngSubmit)="save()" class="flex-1 p-6 flex flex-col gap-4 overflow-y-auto custom-scrollbar">

            @for (col of columns; track col.key) {
              @if (col.key === 'contentTemplate') {
                @if (selectedMode() === 'TEMPLATE_ONLY' || selectedMode() === 'AI_HYBRID') {
                  <app-document-template-editor
                    [control]="$any(form.get(col.key))"
                    [label]="col.label"
                    [placeholder]="contentTemplatePlaceholder"
                  ></app-document-template-editor>
                }
              } @else if (col.key === 'aiPromptTemplate') {
                @if (selectedMode() === 'AI_HYBRID' || selectedMode() === 'AI_FULL') {
                  <app-document-template-editor
                    [control]="$any(form.get(col.key))"
                    [label]="col.label"
                    [placeholder]="aiPromptPlaceholder"
                  ></app-document-template-editor>
                }
              } @else {
                <div class="space-y-2">
                  <label class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
                    {{ col.label }}
                    @if (col.required) { <span class="text-red-500">*</span> }
                  </label>

                  <div class="relative group">
                    @if (col.type === 'boolean') {
                      <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" [formControlName]="col.key" class="sr-only peer">
                        <div class="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        <span class="ml-3 text-sm font-bold text-slate-600 dark:text-slate-300">{{ form.get(col.key)?.value ? 'Activé' : 'Désactivé' }}</span>
                      </label>
                    } @else if (col.type === 'enum' && col.options) {
                      <select [formControlName]="col.key" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none appearance-none cursor-pointer">
                        <option [ngValue]="null">--- SÉLECTIONNER ---</option>
                        @for (opt of col.options; track opt.value) {
                          <option [value]="opt.value">{{ opt.label }}</option>
                        }
                      </select>
                      <div class="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <lucide-icon [img]="ChevronDownIcon" size="18"></lucide-icon>
                      </div>
                    } @else if (col.type === 'textarea') {
                      <textarea [formControlName]="col.key" rows="5" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400 transition-all resize-y min-h-[100px]" [placeholder]="col.placeholder || 'Saisie de ' + col.label.toLowerCase() + '...'"></textarea>
                    } @else {
                      <input [type]="col.type === 'number' ? 'number' : 'text'" [formControlName]="col.key" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400 transition-all" [placeholder]="'Saisie de ' + col.label.toLowerCase() + '...'">
                    }
                  </div>

                  @if (col.key === 'modeGeneration') {
                    @if (!selectedMode()) {
                      <div class="empty-mode-state">
                        <span class="icon">🤖</span>
                        <p class="title">Choisissez un mode de génération</p>
                        <p class="subtitle">
                          Les paramètres nécessaires apparaîtront automatiquement.
                        </p>
                      </div>
                    }
                    @if (selectedMode() === 'TEMPLATE_ONLY') {
                      <div class="mode-card mode-fixed">
                        <span class="mode-icon">📄</span>
                        <div class="mode-content">
                          <p class="mode-title">Modèle fixe</p>
                          <p class="mode-desc">Vous définissez entièrement la structure.</p>
                          <div class="mode-tags">
                            <span>✓ Structure maîtrisée</span>
                            <span>✓ Variables RH</span>
                            <span>✓ Coût : 0€</span>
                          </div>
                        </div>
                      </div>
                    }
                    @if (selectedMode() === 'AI_HYBRID') {
                      <div class="mode-card mode-hybrid">
                        <span class="mode-icon">⚡</span>
                        <div class="mode-content">
                          <p class="mode-title">IA Hybride</p>
                          <p class="mode-desc">Vous gardez le contrôle. L'IA complète.</p>
                          <div class="mode-tags">
                            <span>✓ Structure maîtrisée</span>
                            <span>✓ IA complète le contenu</span>
                            <span>✓ Variables RH</span>
                          </div>
                        </div>
                      </div>
                    }
                    @if (selectedMode() === 'AI_FULL') {
                      <div class="mode-card mode-ai">
                        <span class="mode-icon">✨</span>
                        <div class="mode-content">
                          <p class="mode-title">IA Totale</p>
                          <p class="mode-desc">L'IA génère l'intégralité du document.</p>
                          <div class="mode-tags">
                            <span>✓ Génération complète</span>
                            <span>✓ Style professionnel</span>
                            <span>✓ Guidé par vos instructions</span>
                          </div>
                        </div>
                      </div>
                    }
                  }
                </div>
              }
            }
          </form>

          <!-- Modal Footer -->
          <div class="flex-shrink-0 px-8 py-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-4">
            <button type="button" (click)="closeModal()" class="px-6 py-3 text-sm font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest transition-colors">
              Annuler
            </button>
            <button type="submit" [disabled]="form.invalid || saving()" (click)="save()" class="flex items-center gap-3 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl shadow-xl shadow-indigo-200/50 dark:shadow-none transition-all disabled:opacity-50 disabled:grayscale">
              @if (saving()) {
                <lucide-icon [img]="LoaderIcon" size="18" class="animate-spin"></lucide-icon>
              }
              ENREGISTRER
            </button>
          </div>

        </div>
      </div>
    }

    <!-- Custom Delete Modal Premium (même pattern structure RH) -->
    @if (isDeleteModalOpen()) {
      <div (click)="closeDeleteModal()" class="modal-overlay">

        <div class="modal-content delete-modal" (click)="$event.stopPropagation()">
          <div class="p-8 text-center mt-4">
            <div class="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <lucide-icon [img]="TrashIcon" size="32"></lucide-icon>
            </div>
            <h3 class="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight mb-2">Confirmer la suppression</h3>
            <p class="text-sm font-medium text-slate-400">Cette action est irréversible. Voulez-vous vraiment continuer ?</p>
          </div>

          <div class="p-6 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-3">
            <button (click)="deleteItem()" class="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-red-200 dark:shadow-none active:scale-95">
              OUI, SUPPRIMER
            </button>
            <button (click)="closeDeleteModal()" class="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      </div>
    }
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
    .modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
      background: rgba(2, 6, 23, 0.65);
      animation: overlayIn 0.25s ease-out;
    }
    .modal-content {
      position: relative;
      background: white;
      border-radius: 2.5rem;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.5), 0 8px 20px rgba(0, 0, 0, 0.3);
      width: 100%;
      max-width: 760px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.2);
      animation: contentIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .dark .modal-content {
      background: #0f172a;
    }
    .modal-content.delete-modal {
      max-width: 24rem;
      border-radius: 2rem;
    }
    @keyframes overlayIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes contentIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    .empty-mode-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 28px 24px;
      border: 1.5px dashed #e2e8f0;
      border-radius: 12px;
      text-align: center;
      background: #f8fafc;
      margin-top: 4px;
      animation: fadeSlideIn 0.2s ease;

      .icon { font-size: 28px; margin-bottom: 10px; }
      .title { font-size: 13px; font-weight: 600; color: #1a1a2e; margin-bottom: 4px; }
      .subtitle { font-size: 11px; color: #94a3b8; line-height: 1.5; }
    }

    .mode-card {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      margin-top: 6px;
      animation: fadeSlideIn 0.2s ease;

      .mode-icon { font-size: 18px; margin-top: 1px; }
      .mode-title { font-size: 12px; font-weight: 600; color: #1a1a2e; margin-bottom: 2px; }
      .mode-desc { font-size: 11px; color: #475569; margin-bottom: 6px; }
      .mode-tags {
        display: flex; gap: 6px; flex-wrap: wrap;
        span {
          font-size: 10px; color: #475569;
          background: rgba(255,255,255,0.7);
          padding: 2px 7px; border-radius: 20px;
        }
      }

      &.mode-fixed  { background: #f0fdf4; border: 1px solid #bbf7d0; }
      &.mode-hybrid { background: #fffbeb; border: 1px solid #fde68a; }
      &.mode-ai     { background: #f5f3ff; border: 1px solid #ddd6fe; }
    }

    .field-animated {
      animation: fadeSlideIn 0.25s ease;
    }

    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }

  `]
})
export class RhParametresCrudComponent implements OnInit, OnChanges, OnDestroy {
  @Input() title = '';
  @Input() endpoint = '';
  @Input() columns: CrudColumn[] = [];

  /** Columns visible in the table (excludes hideInTable columns) */
  get tableColumns(): CrudColumn[] {
    return this.columns.filter(c => !c.hideInTable);
  }

  // Icon symbols for direct binding
  readonly CheckIcon = Check;
  readonly AlertIcon = AlertCircle;
  readonly XIcon = X;
  readonly PlusIcon = Plus;
  readonly FolderIcon = FolderOpen;
  readonly EditIcon = Pencil;
  readonly TrashIcon = Trash2;
  readonly ChevronDownIcon = ChevronDown;
  readonly LoaderIcon = Loader2;

  @ViewChild('modalForm', { static: false }) modalFormRef?: ElementRef<HTMLFormElement>;

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  selectedMode = signal<string | null>(null);

  data = signal<any[]>([]);
  loading = signal(true);
  saving = signal(false);
  status = signal<{ type: 'success' | 'error', message: string } | null>(null);

  isModalOpen = signal(false);
  isDeleteModalOpen = signal(false);
  isEditMode = signal(false);
  currentId = signal<number | null>(null);

  form: FormGroup;

  get contentTemplatePlaceholder(): string {
    switch(this.selectedMode()) {
      case 'TEMPLATE_ONLY':
        return 'Attestation de travail\n\nJe soussigné {{company.name}} certifie que\n{{employee.nom}} {{employee.prenom}}, occupant le poste de {{employee.poste}}...';
      case 'AI_HYBRID':
        return 'Écrivez uniquement la structure.\nL\'IA rédigera les paragraphes automatiquement.\n\nEx: {{employee.nom}} — {{employee.poste}}\n\n[Paragraphe rédigé par l\'IA]';
      default: return '';
    }
  }

  get aiPromptPlaceholder(): string {
    switch(this.selectedMode()) {
      case 'AI_HYBRID':
        return 'Complète ce document dans un style administratif français formel.\nRespecte la structure existante.\nSois précis et professionnel.';
      case 'AI_FULL':
        return 'Rédige une attestation de travail administrative conforme au droit français.\nEmployé : {{employee.nom}}, Poste : {{employee.poste}}.\nStyle : formel, concis, professionnel.';
      default: return '';
    }
  }

  constructor() {
    this.form = this.fb.group({});

    // Auto sync body classes when modals open/close
    effect(() => {
      const isOpen = this.isModalOpen() || this.isDeleteModalOpen();
      if (isOpen) {
        document.body.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
      } else {
        document.body.classList.remove('modal-open');
        document.body.style.overflow = '';
      }
    });
  }

  @HostListener('document:keydown.escape')
  handleEscape() {
    if (this.isModalOpen()) this.closeModal();
    if (this.isDeleteModalOpen()) this.closeDeleteModal();
  }

  ngOnInit() {
    this.buildForm();
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['columns'] && !changes['columns'].firstChange) ||
      (changes['endpoint'] && !changes['endpoint'].firstChange)) {
      this.buildForm();
      this.loadData();
    }
  }

  buildForm() {
    const group: any = {};
    this.columns.forEach(col => {
      group[col.key] = ['', col.required ? Validators.required : null];
    });
    this.form = this.fb.group(group);

    const modeControl = this.form.get('modeGeneration');
    if (modeControl) {
      // Set initial value if editing existing record
      this.selectedMode.set(modeControl.value || null);

      // Subscribe with takeUntilDestroyed to avoid memory leak
      modeControl.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(val => this.selectedMode.set(val || null));
    }
  }

  loadData() {
    this.loading.set(true);
    this.http.get<any[]>(`${environment.apiUrl}/${this.endpoint}`).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  getEnumLabel(col: CrudColumn, value: string) {
    return col.options?.find(o => o.value === value)?.label || value;
  }

  openModal(item?: any) {
    document.body.classList.add('parametres-modal-open');

    this.isEditMode.set(!!item);
    this.currentId.set(item?.id || null);

    if (item) {
      this.form.patchValue(item);
    } else {
      this.form.reset();
    }

    const modeControl = this.form.get('modeGeneration');
    if (modeControl) {
      this.selectedMode.set(modeControl.value || null);
    } else {
      this.selectedMode.set(null);
    }

    this.isModalOpen.set(true);

    setTimeout(() => {
      this.modalFormRef?.nativeElement.querySelector<HTMLElement>('input, textarea, select')?.focus();
    });
  }

  closeModal() {
    document.body.classList.remove('parametres-modal-open');

    this.isModalOpen.set(false);
    this.form.reset();
    this.selectedMode.set(null);
  }

  save() {
    if (this.form.invalid) return;

    this.saving.set(true);
    const payload = this.form.value;
    const url = `${environment.apiUrl}/${this.endpoint}`;
    const request = this.isEditMode()
      ? this.http.put(`${url}/${this.currentId()}`, payload)
      : this.http.post(url, payload);

    request.subscribe({
      next: () => {
        this.status.set({ type: 'success', message: `Élément ${this.isEditMode() ? 'modifié' : 'ajouté'} avec succès` });
        this.loadData();
        this.closeModal();
        this.saving.set(false);
        setTimeout(() => this.status.set(null), 3000);
      },
      error: () => {
        this.status.set({ type: 'error', message: 'Une erreur est survenue lors de l\'enregistrement' });
        this.saving.set(false);
        setTimeout(() => this.status.set(null), 3000);
      }
    });
  }

  confirmDelete(id: number) {
    document.body.classList.add('parametres-modal-open');

    this.currentId.set(id);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal() {
    document.body.classList.remove('parametres-modal-open');

    this.isDeleteModalOpen.set(false);
    this.currentId.set(null);
  }

  deleteItem() {
    if (!this.currentId()) return;

    this.http.delete(`${environment.apiUrl}/${this.endpoint}/${this.currentId()}`).subscribe({
      next: () => {
        this.status.set({ type: 'success', message: 'Élément supprimé avec succès' });
        this.loadData();
        this.closeDeleteModal();
        setTimeout(() => this.status.set(null), 3000);
      },
      error: () => {
        this.status.set({ type: 'error', message: 'Erreur lors de la suppression' });
        this.closeDeleteModal();
        setTimeout(() => this.status.set(null), 3000);
      }
    });
  }

  ngOnDestroy() {
    document.body.classList.remove('parametres-modal-open');
    document.body.style.overflow = '';
  }
}
