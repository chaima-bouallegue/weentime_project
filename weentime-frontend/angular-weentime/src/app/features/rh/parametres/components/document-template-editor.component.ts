import { Component, Input, OnInit, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  LucideAngularModule,
  User,
  Building2,
  FileText,
  Search,
  AlertTriangle,
  Braces,
  Sparkles,
  Loader2
} from 'lucide-angular';
import { environment } from '../../../../../environments/environment';

interface TemplateVariable {
  key: string;
  label: string;
  group: string;
  iconName?: string;
}

@Component({
  selector: 'app-document-template-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    LucideAngularModule
  ],
  template: `
    <div class="space-y-4 field-animated">
      <label class="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">
        {{ label }}
      </label>

      <!-- Premium Toolbar Container -->
      <div class="border border-slate-200/80 dark:border-slate-700/60 rounded-3xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm transition-all duration-300">
        
        <!-- Toolbar Headers -->
        <div class="flex items-center gap-2 px-4 py-3 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
          <button type="button"
                  (click)="activeTab.set('variables')"
                  [class.active]="activeTab() === 'variables'"
                  class="tab-btn">
            <lucide-icon [img]="BracesIcon" size="14"></lucide-icon>
            Variables dynamiques
          </button>
          <button type="button"
                  (click)="activeTab.set('ai')"
                  [class.active]="activeTab() === 'ai'"
                  class="tab-btn">
            <lucide-icon [img]="SparklesIcon" size="14"></lucide-icon>
            Aide IA
          </button>
        </div>

        <!-- Toolbar Content Panels -->
        <div class="p-4 bg-white dark:bg-slate-900">
          
          <!-- 1. Variables Panel -->
          @if (activeTab() === 'variables') {
            <div class="space-y-3 animate-in fade-in duration-200">
              
              <!-- Search Bar -->
              <div class="relative">
                <input type="text"
                       [value]="searchQuery()"
                       (input)="onSearchChange($event)"
                       placeholder="Rechercher une variable (ex: nom, date, entreprise)..."
                       class="search-input" />
                <div class="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <lucide-icon [img]="SearchIcon" size="14"></lucide-icon>
                </div>
              </div>

              <!-- Variable Groups -->
              <div class="max-h-[160px] overflow-y-auto pr-1 flex flex-col gap-3 custom-scrollbar">
                @for (group of filteredGroups(); track group.name) {
                  <div class="space-y-1.5">
                    <span class="group-header">
                      <lucide-icon [img]="group.icon" size="12" class="mt-0.5 text-indigo-500"></lucide-icon>
                      {{ group.name }}
                    </span>
                    <div class="flex flex-wrap gap-1.5">
                      @for (v of group.variables; track v.key) {
                        <button type="button"
                                (click)="insertVariable(v.key)"
                                [title]="v.key"
                                class="var-chip">
                          + {{ v.label }}
                        </button>
                      }
                    </div>
                  </div>
                } @empty {
                  <p class="text-xs text-slate-400 dark:text-slate-500 py-2 italic text-center">Aucune variable ne correspond à votre recherche</p>
                }
              </div>

            </div>
          }

          <!-- 2. AI Panel -->
          @if (activeTab() === 'ai') {
            <div class="space-y-3 animate-in fade-in duration-200">
              <div class="flex items-start gap-2">
                <lucide-icon [img]="SparklesIcon" size="16" class="text-indigo-500 mt-0.5 flex-shrink-0"></lucide-icon>
                <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Décrivez le document souhaité en français. L'IA générera un modèle professionnel avec les variables RH appropriées.
                </p>
              </div>

              <textarea
                [value]="aiPrompt()"
                (input)="onAiPromptChange($event)"
                rows="3"
                placeholder="Ex: Je veux une attestation de travail pour un employé, avec son nom, prénom, poste, et la date du jour..."
                class="ai-prompt-input"
                [disabled]="aiGenerating()"
              ></textarea>

              @if (aiError()) {
                <div class="flex items-center gap-2 text-[11px] font-bold text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-xl border border-red-100 dark:border-red-900/40">
                  <lucide-icon [img]="AlertIcon" size="12"></lucide-icon>
                  {{ aiError() }}
                </div>
              }

              <div class="flex items-center justify-between">
                <span class="text-[10px] text-slate-400 italic">Le modèle généré remplacera le contenu actuel</span>
                <button type="button"
                        (click)="generateWithAI()"
                        [disabled]="aiGenerating() || !aiPrompt()"
                        class="ai-generate-btn">
                  @if (aiGenerating()) {
                    <lucide-icon [img]="Loader2Icon" size="14" class="animate-spin"></lucide-icon>
                    Génération en cours...
                  } @else {
                    <lucide-icon [img]="SparklesIcon" size="14"></lucide-icon>
                    Générer le modèle
                  }
                </button>
              </div>
            </div>
          }

        </div>

        <!-- Textarea Editor Area -->
        <div class="relative border-t border-slate-100 dark:border-slate-800">
          <textarea #editorTextarea
                    [formControl]="control"
                    rows="8"
                    [placeholder]="placeholder"
                    class="textarea-editor"></textarea>
        </div>

        <!-- LIVE PREVIEW AREA -->
        @if (control.value) {
          <div class="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4">
            <span class="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">Aperçu en direct (données fictives)</span>
            <div class="preview-box" [innerHTML]="previewHtml()"></div>
          </div>
        }

      </div>

      <!-- VALIDATION ERROR CHIPS -->
      @if (validationErrors().length > 0) {
        <div class="flex flex-wrap gap-2 animate-in slide-in-from-bottom-2 duration-300">
          @for (err of validationErrors(); track err) {
            <div class="validation-chip">
              <lucide-icon [img]="AlertIcon" size="12"></lucide-icon>
              {{ err }}
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      font-size: 11px;
      font-weight: 800;
      color: #64748b;
      background: transparent;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: rgba(0,0,0,0.03);
        color: #475569;
      }

      &.active {
        background: #fff;
        color: #534ab7;
        box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03);
      }
    }

    .search-input {
      width: 100%;
      padding: 10px 14px 10px 38px;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      color: #334155;
      transition: all 0.2s ease;

      &:focus {
        background: #fff;
        border-color: #534ab7;
        box-shadow: 0 0 0 3px rgba(83,74,183,0.1);
      }
    }

    .group-header {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 10px;
      font-weight: 900;
      text-transform: uppercase;
      color: #94a3b8;
      letter-spacing: 0.05em;
      margin-top: 4px;
    }

    .var-chip {
      padding: 5px 10px;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 800;
      color: #475569;
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        background: #e0e7ff;
        border-color: #c7d2fe;
        color: #4f46e5;
        transform: translateY(-1px);
        box-shadow: 0 2px 5px rgba(79, 70, 229, 0.08);
      }

      &:active {
        transform: scale(0.95);
      }
    }

    .textarea-editor {
      width: 100%;
      padding: 16px;
      background: #fff;
      border: none;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.6;
      color: #334155;
      outline: none;
      resize: vertical;
      min-height: 120px;
      font-family: monospace;

      &::placeholder {
        color: #94a3b8;
        font-family: sans-serif;
        font-size: 12px;
      }
    }

    .preview-box {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 14px;
      font-size: 12px;
      line-height: 1.7;
      color: #475569;
      white-space: pre-wrap;
      font-family: serif;
      max-height: 180px;
      overflow-y: auto;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
    }

    .validation-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: #fff5f5;
      border: 1px solid #fee2e2;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 800;
      color: #ef4444;
      box-shadow: 0 1px 2px rgba(239, 68, 68, 0.05);
    }

    .ai-prompt-input {
      width: 100%;
      padding: 12px;
      background: #f8fafc;
      border: 1.5px solid #e2e8f0;
      border-radius: 16px;
      font-size: 11px;
      font-weight: 700;
      outline: none;
      color: #334155;
      resize: none;
      transition: all 0.2s ease;

      &:focus {
        background: #fff;
        border-color: #534ab7;
        box-shadow: 0 0 0 3px rgba(83,74,183,0.1);
      }
    }

    .ai-generate-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      background: #534ab7;
      border: none;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 900;
      color: #fff;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 4px rgba(83,74,183,0.2);

      &:hover:not(:disabled) {
        background: #433a9f;
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(83,74,183,0.3);
      }

      &:active:not(:disabled) {
        transform: scale(0.95);
      }

      &:disabled {
        background: #cbd5e1;
        color: #94a3b8;
        cursor: not-allowed;
        box-shadow: none;
      }
    }

    .field-animated {
      animation: fadeSlideIn 0.25s ease;
    }

    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .custom-scrollbar::-webkit-scrollbar {
      width: 5px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 3px;
    }
  `]
})
export class DocumentTemplateEditorComponent implements OnInit {
  @Input() control!: FormControl;
  @Input() label = '';
  @Input() placeholder = '';

  @ViewChild('editorTextarea', { static: false }) editorTextarea?: ElementRef<HTMLTextAreaElement>;

  // Icon definitions for template
  readonly BracesIcon = Braces;
  readonly SparklesIcon = Sparkles;
  readonly SearchIcon = Search;
  readonly AlertIcon = AlertTriangle;
  readonly Loader2Icon = Loader2;

  private http = inject(HttpClient);

  // Signals
  activeTab = signal<'variables' | 'ai'>('variables');
  variables = signal<TemplateVariable[]>([]);
  searchQuery = signal<string>('');

  // AI generation signals
  aiPrompt = signal<string>('');
  aiGenerating = signal<boolean>(false);
  aiError = signal<string>('');

  // Premium Pre-defined Mock Data for Live Preview
  private readonly PREVIEW_DATA: Record<string, string> = {
    'employee.nom': 'Sannen',
    'employee.prenom': 'Assia',
    'employee.nomComplet': 'Assia Sannen',
    'employee.poste': 'java developer',
    'employee.departement': 'Informatique',
    'employee.email': 'assia.sannen@itserv.com',
    'company.name': 'IT SERV',
    'company.city': 'Tunis',
    'document.date': '29/06/2026',
    'document.moisConcerne': 'Juin 2026',
    'document.motif': 'Attestation administrative',
    'document.type': 'Attestation de Travail'
  };

  // Group variables and map Lucide Icons
  groupedVariables = computed(() => {
    const rawVars = this.variables();
    const groups: Record<string, TemplateVariable[]> = {};

    rawVars.forEach(v => {
      if (!groups[v.group]) {
        groups[v.group] = [];
      }
      groups[v.group].push(v);
    });

    const categoryIcons: Record<string, any> = {
      'Employé': User,
      'Entreprise': Building2,
      'Document': FileText
    };

    return Object.keys(groups).map(name => ({
      name,
      icon: categoryIcons[name] || FileText,
      variables: groups[name]
    }));
  });

  // Filter groups according to search input
  filteredGroups = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const groups = this.groupedVariables();

    if (!query) return groups;

    return groups.map(g => {
      const vars = g.variables.filter(v =>
        v.label.toLowerCase().includes(query) ||
        v.key.toLowerCase().includes(query)
      );
      return { ...g, variables: vars };
    }).filter(g => g.variables.length > 0);
  });

  // Validate template on form control changes
  validationErrors = computed(() => {
    const text = this.control?.value || '';
    const errors: string[] = [];
    if (!text) return errors;

    // 1. Accolades matching count check
    const openCount = (text.match(/\{\{/g) || []).length;
    const closeCount = (text.match(/\}\}/g) || []).length;
    if (openCount > closeCount) {
      errors.push("Accolade fermante '}}' manquante");
    } else if (closeCount > openCount) {
      errors.push("Accolade ouvrante '{{' manquante");
    }

    // 2. Empty braces check
    if (/\{\{\s*\}\}/.test(text)) {
      errors.push("Variable vide '{{ }}' détectée");
    }

    // 3. Unknown variable detection (only when variables have loaded)
    const validKeys = this.variables().map(v => v.key);
    if (validKeys.length > 0) {
      const regex = /\{\{([^}]+)\}\}/g;
      let match;
      const foundKeys = new Set<string>();
      while ((match = regex.exec(text)) !== null) {
        foundKeys.add(match[1].trim());
      }
      for (const key of foundKeys) {
        if (!validKeys.includes(key)) {
          errors.push(`Variable inconnue : {{${key}}}`);
        }
      }
    }

    return errors;
  });

  ngOnInit() {
    this.loadVariables();
  }

  loadVariables() {
    this.http.get<TemplateVariable[]>(`${environment.apiUrl}/documents/rh/template-variables`)
      .subscribe({
        next: (vars) => this.variables.set(vars),
        error: () => {
          // Robust Fallback in case endpoint is not reachable during updates
          this.variables.set([
            { key: 'employee.nom', label: 'Nom', group: 'Employé' },
            { key: 'employee.prenom', label: 'Prénom', group: 'Employé' },
            { key: 'employee.nomComplet', label: 'Nom complet', group: 'Employé' },
            { key: 'employee.poste', label: 'Poste', group: 'Employé' },
            { key: 'employee.departement', label: 'Département', group: 'Employé' },
            { key: 'employee.email', label: 'Email', group: 'Employé' },
            { key: 'company.name', label: 'Entreprise', group: 'Entreprise' },
            { key: 'company.city', label: 'Ville', group: 'Entreprise' },
            { key: 'document.date', label: 'Date', group: 'Document' },
            { key: 'document.moisConcerne', label: 'Mois concerné', group: 'Document' },
            { key: 'document.motif', label: 'Motif', group: 'Document' },
            { key: 'document.type', label: 'Type Doc', group: 'Document' }
          ]);
        }
      });
  }

  onSearchChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  onAiPromptChange(event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    this.aiPrompt.set(textarea.value);
  }

  generateWithAI() {
    const description = this.aiPrompt().trim();
    if (!description) return;

    this.aiGenerating.set(true);
    this.aiError.set('');

    this.http.post<{ template: string }>(
      `${environment.apiUrl}/documents/rh/generate-template-ai`,
      { description }
    ).subscribe({
      next: (res) => {
        if (res && res.template) {
          this.control.setValue(res.template);
          this.control.markAsDirty();
          this.aiPrompt.set('');
          this.activeTab.set('variables'); // switch tab automatically to show variables & preview
        } else {
          this.aiError.set("La réponse de l'assistant IA est vide.");
        }
        this.aiGenerating.set(false);
      },
      error: (err) => {
        console.error(err);
        this.aiError.set("Une erreur est survenue lors de la génération. Veuillez réessayer.");
        this.aiGenerating.set(false);
      }
    });
  }

  insertVariable(variableKey: string) {
    const textToInsert = `{{${variableKey}}}`;
    const textarea = this.editorTextarea?.nativeElement;

    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value || '';
      const before = text.substring(0, start);
      const after = text.substring(end, text.length);
      const newValue = before + textToInsert + after;

      this.control.setValue(newValue);
      this.control.markAsDirty();

      setTimeout(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + textToInsert.length;
      });
    } else {
      const current = this.control.value || '';
      this.control.setValue(current + textToInsert);
      this.control.markAsDirty();
    }
  }

  previewHtml(): string {
    let text = this.control.value || '';
    if (!text) return '';

    // Prevent direct execution of HTML/Scripts inside preview box
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

    const regex = /\{\{([^}]+)\}\}/g;
    return text.replace(regex, (match: string, key: string) => {
      const cleanKey = key.trim();
      const val = this.PREVIEW_DATA[cleanKey];
      if (val !== undefined) {
        return `<strong class="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-lg border border-indigo-100 dark:border-indigo-900/50 mx-0.5 font-black text-[11px]">${val}</strong>`;
      }
      return `<span class="bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-1.5 py-0.5 rounded-lg border border-rose-100 dark:border-rose-900/50 mx-0.5 font-black text-[11px]">${match}</span>`;
    });
  }
}
