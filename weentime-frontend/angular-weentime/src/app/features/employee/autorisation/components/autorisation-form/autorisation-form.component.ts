import { Component, OnInit, signal, computed, inject, Input, Output, EventEmitter, HostListener, ChangeDetectionStrategy, ChangeDetectorRef, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LucideAngularModule, Stethoscope, LogOut, AlarmClock, Laptop, Coffee, Hourglass, X, ChevronLeft, Calendar, FileText, Send, Loader2, Info, AlertTriangle, CheckCircle, Timer } from 'lucide-angular';
import { Router, ActivatedRoute } from '@angular/router';
import {
  TypeAutorisation,
  ATTACHMENT_CONFIG
} from '../../../../../core/models/autorisation.model';
import { AssistantWorkflowService } from '../../../../../core/services/assistant-workflow.service';
import { AutorisationService } from '../../../../../core/services/autorisation.service';
import { ToastService } from '../../../../../core/services/toast.service';

@Component({
  selector: 'app-autorisation-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LucideAngularModule],
  templateUrl: './autorisation-form.component.html',
  styleUrl: './autorisation-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class AutorisationFormComponent implements OnInit {
  private fb = inject(FormBuilder);
  private service = inject(AutorisationService);
  private toastService = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private assistantWorkflow = inject(AssistantWorkflowService);

  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<void>();

  @Input() set defaultType(value: string | null | undefined) {
    this._defaultType = value;
    this.applyDefaultType();
  }
  private _defaultType: string | null | undefined = null;

  // Icons
  readonly iconX = X;
  readonly iconChevronLeft = ChevronLeft;
  readonly iconCalendar = Calendar;
  readonly iconFile = FileText;
  readonly iconSend = Send;
  readonly iconLoader = Loader2;
  readonly iconInfo = Info;
  readonly iconAlert = AlertTriangle;
  readonly iconCheck = CheckCircle;
  readonly iconTimer = Timer;

  isOpen = false;
  isDesktop = true;
  isStandalonePage = false;
  showConfirmation = false;
  isSubmitting = false;
  selectedFile: File | null = null;
  readonly minDate = new Date().toISOString().split('T')[0];

  form: FormGroup;

  // Signals for reactivity in 'OnPush' combined with computed
  heureDebutValue = signal<string>('');
  heureFinValue = signal<string>('');
  typeValue = signal<TypeAutorisation | null>(null);

  types = signal<any[]>([]);

  private readonly defaultIcons: Record<string, any> = {
    'RDV MEDICAL': Stethoscope,
    'SORTIE ANTICIPEE': LogOut,
    'ARRIVEE TARDIVE': AlarmClock,
    'TELETRAVAIL EXCEPTIONNEL': Laptop,
    'PAUSE LONGUE': Coffee,
    'MI TEMPS EXCEPTIONNEL': Hourglass
  };

  private readonly defaultStyles: Record<string, { bg: string, color: string }> = {
    'RDV MEDICAL': { bg: 'bg-rose-50', color: 'text-rose-600' },
    'SORTIE ANTICIPEE': { bg: 'bg-amber-50', color: 'text-amber-600' },
    'ARRIVEE TARDIVE': { bg: 'bg-blue-50', color: 'text-blue-600' },
    'TELETRAVAIL EXCEPTIONNEL': { bg: 'bg-indigo-50', color: 'text-indigo-600' },
    'PAUSE LONGUE': { bg: 'bg-emerald-50', color: 'text-emerald-600' },
    'MI TEMPS EXCEPTIONNEL': { bg: 'bg-violet-50', color: 'text-violet-600' }
  };

  constructor() {
    this.form = this.fb.group({
      type: [null, Validators.required],
      date: ['', Validators.required],
      heureDebut: ['', Validators.required],
      heureFin: ['', Validators.required],
      motif: ['', [Validators.required, Validators.minLength(10)]],
      justificatif: [null]
    });
  }

  ngOnInit(): void {
    this.checkScreenSize();
    this.isStandalonePage = this.router.url.includes('nouvelle');

    // Smooth entry - trigger CD manually since we are using OnPush
    setTimeout(() => {
      this.isOpen = true;
      this.cdr.markForCheck();
    }, 50);

    this.service.getTypesAutorisation().subscribe(types => {
      const mapped = types.map(t => ({
        id: t.libelle,
        label: t.libelle,
        icon: this.defaultIcons[t.libelle.toUpperCase()] || Timer,
        bg: this.defaultStyles[t.libelle.toUpperCase()]?.bg || 'bg-slate-50',
        color: this.defaultStyles[t.libelle.toUpperCase()]?.color || 'text-slate-600',
        desc: t.requireJustificatif ? 'Justificatif requis' : 'Sans justificatif'
      }));
      this.types.set(mapped);
      this.applyDefaultType();
      this.cdr.markForCheck();
    });

    // Sync form values with signals for computed properties
    this.form.get('heureDebut')?.valueChanges.subscribe(v => this.heureDebutValue.set(v));
    this.form.get('heureFin')?.valueChanges.subscribe(v => this.heureFinValue.set(v));

    // Dynamic validation for attachment
    this.form.get('type')?.valueChanges.subscribe(type => {
      this.typeValue.set(type as TypeAutorisation);
      const config = ATTACHMENT_CONFIG[type as TypeAutorisation];
      const control = this.form.get('justificatif');
      if (config === 'REQUIRED') {
        control?.setValidators(Validators.required);
      } else {
        control?.clearValidators();
      }
      control?.updateValueAndValidity();
    });

    this.applyAssistantDraft();
  }

  @HostListener('window:resize')
  checkScreenSize() {
    this.isDesktop = window.innerWidth >= 1024;
  }

  @HostListener('window:keydown.escape')
  onEsc() {
    this.handleClose();
  }

  get containerClasses(): string {
    if (this.isStandalonePage) return 'flex flex-col w-full h-full bg-white';

    const base = 'fixed top-0 right-0 z-[51] flex flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out';
    return this.isDesktop
      ? `${base} w-[480px] h-full`
      : `fixed inset-0 z-[51] flex flex-col bg-white h-full w-full`;
  }

  get attachmentMode() {
    const type = this.typeValue();
    const dynamicType = this.types().find(t => t.id === type);
    return dynamicType?.desc === 'Justificatif requis' ? 'REQUIRED' : 'HIDDEN';
  }

  dureeInfo = computed(() => {
    const h1 = this.heureDebutValue();
    const h2 = this.heureFinValue();
    if (!h1 || !h2) return { libelle: '--', decimal: 0, heures: 0, minutes: 0 };
    return this.service.calculerDuree(h1, h2);
  });

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      this.form.patchValue({ justificatif: file });
      this.form.get('justificatif')?.markAsTouched();
    }
  }

  removeFile(event: Event) {
    event.stopPropagation();
    this.selectedFile = null;
    this.form.patchValue({ justificatif: null });
  }

  handleClose() {
    if (this.form.dirty || this.selectedFile) {
      this.showConfirmation = true;
    } else {
      this.confirmClose();
    }
  }

  confirmClose() {
    this.showConfirmation = false;
    this.isOpen = false;
    this.cdr.markForCheck(); // Ensure the animation triggers
    
    setTimeout(() => {
      if (this.isStandalonePage) {
        this.goBack();
      } else {
        this.close.emit();
      }
    }, 300); // Matches transition duration
  }

  goBack() {
    this.router.navigate(['/app/employee/autorisations']);
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const businessRuleError = this.validateBusinessRules();
    if (businessRuleError) {
      this.toastService.error(businessRuleError);
      return;
    }

    this.isSubmitting = true;
    this.service.soumettreDemande(this.form.value).subscribe({
      next: () => {
        this.toastService.success('Votre demande a été soumise avec succès.');
        this.isSubmitting = false;
        this.isOpen = false;
        this.cdr.markForCheck(); // Trigger closing animation
        setTimeout(() => this.submitted.emit(), 300);
      },
      error: () => {
        this.toastService.error('Une erreur est survenue lors de la soumission.');
        this.isSubmitting = false;
        this.cdr.markForCheck();
      }
    });
  }

  private validateBusinessRules(): string | null {
    const date = this.form.get('date')?.value as string | null;
    const heureDebut = this.form.get('heureDebut')?.value as string | null;
    const heureFin = this.form.get('heureFin')?.value as string | null;

    if (!date || !heureDebut || !heureFin) {
      return null;
    }

    const selectedDate = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      return 'La date choisie ne peut pas être dans le passé.';
    }

    if (heureFin <= heureDebut) {
      return "L'heure de fin doit être postérieure à l'heure de début.";
    }

    return null;
  }

  private applyAssistantDraft(): void {
    const draft = this.assistantWorkflow.authorizationDraft();
    if (!draft) {
      return;
    }

    const type = this.resolveDraftType(draft.type);
    this.form.patchValue({
      type,
      date: draft.date ?? '',
      heureDebut: this.normalizeTime(draft.heureDebut),
      heureFin: this.normalizeTime(draft.heureFin),
      motif: draft.motif ?? '',
    });
    if (type) {
      this.typeValue.set(type);
    }

    this.assistantWorkflow.clearAuthorizationDraft(draft.id);
    this.cdr.markForCheck();
  }

  private normalizeTime(value?: string): string {
    if (!value) {
      return '';
    }
    return value.length >= 5 ? value.slice(0, 5) : value;
  }

  private resolveDraftType(value?: string): any | null {
    const types = this.types();
    if (!value || types.length === 0) {
      return null;
    }
    const normalized = typeof value === 'string'
      ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
      : '';

    if (!normalized) {
      return null;
    }

    // Look for exact or partial match in label
    const found = types.find(t => {
      const tLabel = t.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return tLabel.includes(normalized) || normalized.includes(tLabel);
    });

    return found?.id ?? null;
  }

  private applyDefaultType(): void {
    if (!this._defaultType) return;
    const types = this.types();
    if (types.length === 0) return;
    const found = types.find(t => 
      t.id.toLowerCase() === this._defaultType?.toLowerCase() ||
      t.label.toLowerCase() === this._defaultType?.toLowerCase()
    );
    if (found) {
      this.form.patchValue({ type: found.id });
      this.typeValue.set(found.id as TypeAutorisation);
      this.cdr.markForCheck();
    }
  }
}
