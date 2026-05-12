import { Component, Input, Output, EventEmitter, signal, computed, inject, OnInit, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X, ChevronLeft, ChevronRight, FileText, CheckCircle, Info, Calendar, Loader2, Send } from 'lucide-angular';
import { AssistantWorkflowService } from '../../../../../core/services/assistant-workflow.service';
import { TypeDocumentConfig, TypeDocument, NouvelleDemandeDocumentRequest } from '../../models/document.model';

@Component({
  selector: 'app-demande-document-drawer',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  templateUrl: './demande-document-drawer.component.html',
  styleUrl: './demande-document-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DemandeDocumentDrawerComponent implements OnInit {
  @Input() types: TypeDocumentConfig[] = [];
  @Input() typePreselectionne: TypeDocument | null = null;
  @Input() isSubmitting = false;

  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<NouvelleDemandeDocumentRequest>();

  private readonly assistantWorkflow = inject(AssistantWorkflowService);

  // Icons
  readonly iconX = X;
  readonly iconChevronLeft = ChevronLeft;
  readonly iconChevronRight = ChevronRight;
  readonly iconFile = FileText;
  readonly iconCheck = CheckCircle;
  readonly iconInfo = Info;
  readonly iconCalendar = Calendar;
  readonly iconLoader = Loader2;
  readonly iconSend = Send;

  step = signal(1);
  selectedType = signal<TypeDocument | null>(null);
  moisConcerne = signal('');
  motif = signal('');
  selectedFile = signal<File | null>(null);

  moisDisponibles: string[] = [];

  selectedConfig = computed(() =>
    this.types.find(t => t.type === this.selectedType())
  );

  canProceed = computed(() => {
    const type = this.selectedType();
    if (!type) return false;
    const config = this.selectedConfig();
    if (config?.requiresMois && !this.moisConcerne()) return false;
    return true;
  });

  ngOnInit(): void {
    this.generateMoisDisponibles();
    if (this.typePreselectionne) {
      this.selectedType.set(this.typePreselectionne);
    }
    this.applyAssistantDraft();
  }

  selectType(type: TypeDocument): void {
    this.selectedType.set(type);
    this.moisConcerne.set('');
  }

  changeType(): void {
    this.selectedType.set(null);
    this.moisConcerne.set('');
  }

  nextStep(): void {
    if (this.step() === 1 && this.canProceed()) {
      this.step.set(2);
    }
  }

  prevStep(): void {
    if (this.step() > 1) {
      this.step.update(s => s - 1);
    }
  }

  onMotifInput(value: string): void {
    if (value.length <= 250) {
      this.motif.set(value);
    }
  }

  onMoisChange(value: string): void {
    this.moisConcerne.set(value);
  }

  onSubmit(): void {
    if (!this.selectedType() || this.isSubmitting) return;
    const request: NouvelleDemandeDocumentRequest = {
      type: this.selectedType()!,
      moisConcerne: this.moisConcerne() || undefined,
      motif: this.motif() || undefined,
      file: this.selectedFile()
    };
    this.submitted.emit(request);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  private generateMoisDisponibles(): void {
    const now = new Date();
    this.moisDisponibles = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      this.moisDisponibles.push(label.charAt(0).toUpperCase() + label.slice(1));
    }
  }

  private applyAssistantDraft(): void {
    const draft = this.assistantWorkflow.documentDraft();
    if (!draft) {
      return;
    }

    if (!this.selectedType() && draft.type) {
      this.selectedType.set(this.resolveDraftType(draft.type));
    }
    if (draft.moisConcerne) {
      this.moisConcerne.set(this.resolveMonthLabel(draft.moisConcerne));
    }
    if (draft.motif) {
      this.motif.set(draft.motif);
    }
    if (this.selectedType()) {
      this.step.set(2);
    }

    this.assistantWorkflow.clearDocumentDraft(draft.id);
  }

  private resolveDraftType(value: string): TypeDocument | null {
    const normalized = value.trim().toUpperCase();
    const found = this.types.find(type => 
      type.type === normalized || 
      type.label.toUpperCase().includes(normalized) ||
      normalized.includes(type.label.toUpperCase())
    );
    return found ? found.type : null;
  }

  private resolveMonthLabel(value: string): string {
    const trimmed = value.trim();
    const normalized = this.normalize(trimmed);
    const exact = this.moisDisponibles.find(item => this.normalize(item) === normalized);
    if (exact) {
      return exact;
    }

    const isoMatch = /^(\d{4})-(\d{2})$/.exec(trimmed);
    if (isoMatch) {
      const parsed = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, 1);
      if (!Number.isNaN(parsed.getTime())) {
        const label = parsed.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const formatted = label.charAt(0).toUpperCase() + label.slice(1);
        return this.moisDisponibles.find(item => this.normalize(item) === this.normalize(formatted)) ?? formatted;
      }
    }

    return trimmed;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }
}
