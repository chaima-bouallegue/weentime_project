import { Component, Input, OnInit, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../../../../environments/environment';

export interface CrudColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'enum';
  options?: { value: string, label: string }[]; // For enum
  required?: boolean;
}

@Component({
  selector: 'app-rh-parametres-crud',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, LucideAngularModule],
  template: `
    <div class="flex flex-col gap-6 animate-in fade-in duration-500">
      
      <!-- Toolbar -->
      <div class="flex flex-col gap-4">
        <!-- Global Feedback Message -->
        @if (status()) {
          <div class="animate-in slide-in-from-top-4 duration-300 px-6 py-4 rounded-3xl flex items-center justify-between gap-3 border shadow-sm"
               [ngClass]="status()?.type === 'success' ? 'bg-emerald-50 border-emerald-100/50 text-emerald-700' : 'bg-rose-50 border-rose-100/50 text-rose-700'">
            <div class="flex items-center gap-3">
              <lucide-icon [name]="status()?.type === 'success' ? 'check' : 'alert-circle'" size="20"></lucide-icon>
              <span class="text-sm font-bold">{{ status()?.message }}</span>
            </div>
            <button (click)="status.set(null)" class="text-current opacity-50 hover:opacity-100 transition-opacity">
              <lucide-icon name="x" size="16"></lucide-icon>
            </button>
          </div>
        }

        <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm">
          <div>
            <h3 class="text-xl font-extrabold text-slate-800 dark:text-white tracking-tight">
              Liste des {{ title }}
            </h3>
            <p class="text-xs font-medium text-slate-400 mt-1">Gérez vos paramètres en toute simplicité</p>
          </div>
          <button (click)="openModal()" class="group flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-slate-900 dark:hover:bg-white dark:hover:text-slate-900 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-indigo-200 dark:shadow-none active:scale-95">
            <lucide-icon name="plus" size="18" class="group-hover:rotate-90 transition-transform"></lucide-icon>
            Nouveau
          </button>
        </div>
      </div>

      <!-- Table Container -->
      <div class="bg-white dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-sm">
        <div class="overflow-x-auto">
          <table class="w-full text-sm text-left border-collapse">
            <thead>
              <tr class="bg-slate-50/80 dark:bg-slate-900/40 border-b border-slate-200/60 dark:border-slate-700/60">
                @for (col of columns; track col.key) {
                  <th class="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{{ col.label }}</th>
                }
                <th class="px-6 py-4 text-right text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
              @if (loading()) {
                <tr>
                  <td [colSpan]="columns.length + 1" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center gap-3">
                      <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                      <span class="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Chargement intelligent...</span>
                    </div>
                  </td>
                </tr>
              } @else if (data().length === 0) {
                <tr>
                  <td [colSpan]="columns.length + 1" class="px-6 py-12 text-center">
                    <div class="flex flex-col items-center gap-2 opacity-40">
                      <lucide-icon name="folder-open" size="48" class="text-slate-300"></lucide-icon>
                      <span class="text-sm font-bold text-slate-400 uppercase italic">Aucune donnée disponible</span>
                    </div>
                  </td>
                </tr>
              } @else {
                @for (item of data(); track item.id) {
                  <tr class="hover:bg-indigo-50/30 dark:hover:bg-indigo-500/5 transition-colors group">
                    @for (col of columns; track col.key) {
                      <td class="px-6 py-4 whitespace-nowrap">
                        @if (col.type === 'boolean') {
                          <div class="flex items-center">
                            @if (item[col.key]) {
                              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                                <span class="w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                                Activé
                              </span>
                            } @else {
                              <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                                <span class="w-1 h-1 rounded-full bg-slate-400"></span>
                                Désactivé
                              </span>
                            }
                          </div>
                        } @else if (col.type === 'enum' && col.options) {
                          <span class="font-bold text-slate-700 dark:text-slate-200">{{ getEnumLabel(col, item[col.key]) }}</span>
                        } @else if (col.type === 'number') {
                          <span class="font-mono font-bold text-indigo-600 dark:text-indigo-400">{{ item[col.key] || '0' }}</span>
                        } @else {
                          <span class="font-medium text-slate-700 dark:text-slate-300">{{ item[col.key] || '-' }}</span>
                        }
                      </td>
                    }
                    <td class="px-6 py-4 text-right">
                      <div class="flex items-center justify-end gap-2 transition-all duration-300">
                        <button (click)="openModal(item)" class="p-2.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600 active:scale-90" title="Modifier">
                          <lucide-icon name="pencil" size="16"></lucide-icon>
                        </button>
                        <button (click)="confirmDelete(item.id)" class="p-2.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-700 rounded-xl transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600 active:scale-90" title="Supprimer">
                          <lucide-icon name="trash-2" size="16"></lucide-icon>
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
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md" (click)="closeModal()"></div>
        
        <div class="relative bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl shadow-black/30 w-full max-w-lg overflow-hidden border border-white/20 scale-100 animate-in zoom-in-95 duration-300">
          
          <!-- Modal Header -->
          <div class="relative px-10 py-8 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="text-2xl font-extrabold text-slate-800 dark:text-white tracking-tight">
                  {{ isEditMode() ? 'Modifier' : 'Ajouter' }} <span class="text-indigo-600 dark:text-indigo-400">un élément</span>
                </h3>
                <p class="text-xs font-medium text-slate-400 mt-1">Remplissez les informations ci-dessous</p>
              </div>
              <button (click)="closeModal()" class="w-10 h-10 flex items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all border border-slate-100 dark:border-slate-700">
                <lucide-icon name="x" size="20"></lucide-icon>
              </button>
            </div>
          </div>

          <!-- Modal Body -->
          <form [formGroup]="form" (ngSubmit)="save()" class="p-8 flex flex-col gap-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
            
            @for (col of columns; track col.key) {
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
                    <select [formControlName]="col.key" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none transition-all appearance-none cursor-pointer">
                      <option [ngValue]="null">--- SÉLECTIONNER ---</option>
                      @for (opt of col.options; track opt.value) {
                        <option [value]="opt.value">{{ opt.label }}</option>
                      }
                    </select>
                    <div class="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                       <lucide-icon name="chevron-down" size="18"></lucide-icon>
                    </div>
                  } @else {
                    <input [type]="col.type === 'number' ? 'number' : 'text'" [formControlName]="col.key" class="w-full px-5 py-3.5 bg-slate-100 dark:bg-slate-800 border-2 border-transparent dark:border-slate-800 rounded-2xl text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 text-slate-700 dark:text-slate-200 outline-none placeholder-slate-400 transition-all" [placeholder]="'Saisie de ' + col.label.toLowerCase() + '...'">
                  }
                </div>
              </div>
            }
          </form>

          <!-- Modal Footer -->
          <div class="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-end gap-4">
            <button type="button" (click)="closeModal()" class="px-6 py-3 text-sm font-black text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 uppercase tracking-widest transition-colors">
              Annuler
            </button>
            <button type="submit" [disabled]="form.invalid || saving()" (click)="save()" class="flex items-center gap-3 px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black rounded-2xl shadow-xl shadow-indigo-200 dark:shadow-none transition-all disabled:opacity-50 disabled:grayscale">
              @if (saving()) {
                <lucide-icon name="loader-2" size="18" class="animate-spin"></lucide-icon>
              }
              ENREGISTRER
            </button>
          </div>

        </div>
      </div>
    }

    <!-- Custom Delete Modal Premium -->
    @if (isDeleteModalOpen()) {
      <div class="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
        <div class="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" (click)="closeDeleteModal()"></div>
        
        <div class="relative bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden border border-slate-100 dark:border-slate-800 scale-100 animate-in zoom-in-95 duration-300">
          <div class="p-8 text-center mt-4">
            <div class="w-16 h-16 bg-red-50 dark:bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <lucide-icon name="trash-2" size="32"></lucide-icon>
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
  `]
})
export class RhParametresCrudComponent implements OnInit, OnChanges {
  @Input() title = '';
  @Input() endpoint = '';
  @Input() columns: CrudColumn[] = [];

  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  data = signal<any[]>([]);
  loading = signal(true);
  saving = signal(false);
  status = signal<{type: 'success' | 'error', message: string} | null>(null);

  isModalOpen = signal(false);
  isDeleteModalOpen = signal(false);
  isEditMode = signal(false);
  currentId = signal<number | null>(null);

  form: FormGroup;

  constructor() {
    this.form = this.fb.group({});
  }

  ngOnInit() {
    this.buildForm();
    this.loadData();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['columns'] && !changes['columns'].firstChange) {
      this.buildForm();
      this.loadData();
    }
  }

  private buildForm() {
    const group: any = {};
    for (const col of this.columns) {
      group[col.key] = [col.type === 'boolean' ? false : null, col.required ? Validators.required : []];
    }
    this.form = this.fb.group(group);
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

  getEnumLabel(col: CrudColumn, value: string): string {
    return col.options?.find(o => o.value === value)?.label || value;
  }

  openModal(item?: any) {
    if (!this.form) this.buildForm(); // Safety check

    this.form.reset();
    if (item) {
      this.isEditMode.set(true);
      this.currentId.set(item.id);
      this.form.patchValue(item);
    } else {
      this.isEditMode.set(false);
      this.currentId.set(null);
      // set defaults for booleans
      this.columns.filter(c => c.type === 'boolean').forEach(c => this.form.get(c.key)?.setValue(false));
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.status.set(null);
  }

  save() {
    if (this.form.invalid) return;
    this.saving.set(true);

    const payload = this.form.value;
    const req = this.isEditMode()
      ? this.http.put(`${environment.apiUrl}/${this.endpoint}/${this.currentId()}`, payload)
      : this.http.post(`${environment.apiUrl}/${this.endpoint}`, payload);

    req.subscribe({
      next: () => {
        this.status.set({type: 'success', message: 'L’élément a été enregistré avec succès !'});
        this.closeModal();
        this.loadData();
        setTimeout(() => this.status.set(null), 4000);
      },
      error: (err) => {
        this.saving.set(false);
        this.status.set({type: 'error', message: 'Une erreur est survenue lors de l’enregistrement.'});
      }
    });
  }

  confirmDelete(id: number) {
    this.currentId.set(id);
    this.isDeleteModalOpen.set(true);
  }

  closeDeleteModal() {
    this.isDeleteModalOpen.set(false);
    this.currentId.set(null);
  }

  deleteItem() {
    const id = this.currentId();
    if (!id) return;

    this.http.delete(`${environment.apiUrl}/${this.endpoint}/${id}`).subscribe({
      next: () => {
        this.status.set({type: 'success', message: 'L’élément a été supprimé definitivement.'});
        this.closeDeleteModal();
        this.loadData();
        setTimeout(() => this.status.set(null), 4000);
      },
      error: () => {
        this.status.set({type: 'error', message: 'Impossible de supprimer cet élément.'});
        this.closeDeleteModal();
      }
    });
  }
}
