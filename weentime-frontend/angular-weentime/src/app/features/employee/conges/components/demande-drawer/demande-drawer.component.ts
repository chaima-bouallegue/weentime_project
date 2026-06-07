import { Component, Input, Output, EventEmitter, signal, computed, inject, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators, FormGroup } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { AssistantWorkflowService } from '../../../../../core/services/assistant-workflow.service';
import { DemandeConge, JourFerie, NouvelleDemandeRequest, SoldeConge, TypeConge } from '../../models/conge.model';
import { CongeService } from '../../conge.service';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  holiday?: JourFerie;
  isSelectable: boolean;
}

@Component({
  selector: 'app-demande-drawer',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule, ReactiveFormsModule],
  templateUrl: './demande-drawer.component.html',
  styleUrl: './demande-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DemandeDrawerComponent implements OnInit {
  @Input() soldes: SoldeConge[] = [];
  @Input() joursFeries: JourFerie[] = [];
  @Input() historique: DemandeConge[] = [];
  @Input() isSubmitting = false;
  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<NouvelleDemandeRequest>();

  private readonly fb = inject(FormBuilder);
  private readonly assistantWorkflow = inject(AssistantWorkflowService);
  private readonly congeService = inject(CongeService);

  readonly leaveTypes = signal<any[]>([]);
  readonly step = signal(1);
  readonly selectedType = signal<any | null>(null);
  readonly startDate = signal<Date | null>(null);
  readonly endDate = signal<Date | null>(null);
  readonly hoverDate = signal<Date | null>(null);
  readonly viewDate = signal(new Date());
  readonly selectedJustificatif = signal<File | null>(null);
  readonly calendarDays = computed(() => this.generateCalendarDays(this.viewDate()));
  readonly validationError = signal<string | null>(null);
  readonly weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  readonly motifForm: FormGroup = this.fb.group({
    motif: ['', [Validators.required, Validators.minLength(10)]]
  });

  ngOnInit(): void {
    this.congeService.getTypesConge().subscribe({
      next: (types: any[]) => {
        this.leaveTypes.set(types);
        this.applyAssistantDraft();
      },
      error: (error) => {
        this.validationError.set(this.extractErrorMessage(error, 'Impossible de charger les types de conge.'));
      }
    });
  }

  private applyAssistantDraft(): void {
    const draft = this.assistantWorkflow.leaveDraft();
    if (!draft) {
      return;
    }

    const type = this.resolveDraftType(draft.typeLabel, draft.typeCongeId);
    const startDate = this.toDate(draft.dateDebut);
    const endDate = this.toDate(draft.dateFin);

    if (type) {
      this.selectedType.set(type);
      this.step.set(2);
    }
    if (startDate) {
      this.startDate.set(startDate);
      this.viewDate.set(new Date(startDate));
    }
    if (endDate) {
      this.endDate.set(endDate);
    }
    if (draft.motif) {
      this.motifForm.patchValue({ motif: draft.motif });
    }
    if (type && startDate && endDate) {
      this.step.set(3);
    }

    this.assistantWorkflow.clearLeaveDraft(draft.id);
  }

  selectType(type: any): void {
    if (this.isTypeDisabled(type)) {
      return;
    }
    this.validationError.set(null);
    this.selectedType.set(type);
    this.selectedJustificatif.set(null);
    this.step.set(2);
  }

  onDayClick(day: CalendarDay): void {
    if (!day.isSelectable) {
      return;
    }

    this.validationError.set(null);
    if (!this.startDate() || this.endDate()) {
      this.startDate.set(day.date);
      this.endDate.set(null);
      return;
    }

    if (day.date < this.startDate()!) {
      this.startDate.set(day.date);
      return;
    }

    this.endDate.set(day.date);
  }

  onDayHover(day: CalendarDay): void {
    if (this.startDate() && !this.endDate() && day.isSelectable) {
      this.hoverDate.set(day.date);
      return;
    }

    this.hoverDate.set(null);
  }

  isInRange(date: Date): boolean {
    const start = this.startDate();
    const end = this.endDate() || this.hoverDate();
    if (!start || !end) {
      return false;
    }

    const currentTime = date.getTime();
    const startTime = start.getTime();
    const endTime = end.getTime();
    if (startTime <= endTime) {
      return currentTime >= startTime && currentTime <= endTime;
    }

    return currentTime >= endTime && currentTime <= startTime;
  }

  isSelectionStart(date: Date): boolean {
    return this.startDate()?.getTime() === date.getTime();
  }

  isSelectionEnd(date: Date): boolean {
    return (this.endDate() || this.hoverDate())?.getTime() === date.getTime();
  }

  prevMonth(): void {
    this.validationError.set(null);
    const current = new Date(this.viewDate());
    current.setMonth(current.getMonth() - 1);
    this.viewDate.set(current);
  }

  nextMonth(): void {
    this.validationError.set(null);
    const current = new Date(this.viewDate());
    current.setMonth(current.getMonth() + 1);
    this.viewDate.set(current);
  }

  get selectedBusinessDays(): number {
    if (!this.startDate() || !this.endDate()) {
      return 0;
    }

    return this.calculateBusinessDays(this.startDate()!, this.endDate()!);
  }

  nextStep(): void {
    const error = this.validateSelection();
    if (error) {
      this.validationError.set(error);
      return;
    }

    this.validationError.set(null);
    this.step.set(3);
  }

  prevStep(): void {
    if (this.step() > 1) {
      this.validationError.set(null);
      this.step.update(value => value - 1);
    }
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    const error = this.validateSelection() ?? this.validateMotif();
    if (error) {
      this.validationError.set(error);
      this.motifForm.markAllAsTouched();
      return;
    }

    this.validationError.set(null);
    this.submitted.emit({
      type: this.selectedType()?.libelle as TypeConge,
      label: this.selectedType()?.libelle,
      typeCongeId: this.selectedType()?.id,
      dateDebut: this.startDate()!.toISOString().split('T')[0],
      dateFin: this.endDate()!.toISOString().split('T')[0],
      motif: this.motifForm.value.motif,
      justificatif: this.selectedJustificatif(),
      justificatifFourni: Boolean(this.selectedJustificatif())
    });
  }

  getTypeLabel(type: any): string {
    return type?.libelle || 'Type inconnu';
  }

  getSoldeForType(typeOrLibelle: any): number {
    const libelle = typeof typeOrLibelle === 'object' ? typeOrLibelle?.libelle : typeOrLibelle;
    if (!libelle) return 0;
    
    const normalizedSearch = this.normalize(libelle);
    const solde = this.soldes.find(item => {
      const normType = this.normalize(item.type);
      const normLabel = this.normalize(item.label);
      return normType === normalizedSearch || 
             normLabel === normalizedSearch ||
             normType.includes(normalizedSearch) ||
             normalizedSearch.includes(normType) ||
             normLabel.includes(normalizedSearch) ||
             normalizedSearch.includes(normLabel);
    });
    
    return solde?.disponible || 0;
  }

  isBalanceTracked(type: any): boolean {
    const libelle = this.normalize(type?.libelle);
    if (libelle.includes('sans')) {
      return false;
    }
    if (type?.decompteJours !== undefined || type?.decompterJours !== undefined) {
      return Boolean(type.decompteJours ?? type.decompterJours);
    }
    return true;
  }

  requiresJustificatif(type: any): boolean {
    return Boolean(type?.requireJustificatif ?? type?.justificatifExige);
  }

  isTypeDisabled(type: any): boolean {
    return this.isBalanceTracked(type) && this.getSoldeForType(type.libelle) <= 0;
  }

  onJustificatifChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedJustificatif.set(input.files?.[0] ?? null);
    this.validationError.set(null);
  }

  canProceedToSummary(): boolean {
    return !this.validateSelection();
  }

  private validateSelection(): string | null {
    const type = this.selectedType();
    const startDate = this.startDate();
    const endDate = this.endDate();
    if (!type) {
      return 'Selectionnez un type de congé.';
    }

    if (!startDate || !endDate) {
      return 'Selectionnez une date de debut et une date de fin.';
    }

    if (this.selectedBusinessDays <= 0) {
      return 'La periode choisie ne contient aucun jour ouvrable disponible.';
    }

    if (this.isBalanceTracked(type) && this.selectedBusinessDays > this.getSoldeForType(type.libelle)) {
      return `Solde insuffisant (${this.getSoldeForType(type.libelle)} jours disponibles).`;
    }

    if (this.findOverlappingRequest()) {
      return 'Une demande existe deja sur cette periode.';
    }

    return null;
  }

  private validateMotif(): string | null {
    if (this.requiresJustificatif(this.selectedType()) && !this.selectedJustificatif()) {
      return 'Un justificatif est obligatoire pour ce type de conge.';
    }

    const motifControl = this.motifForm.get('motif');
    if (!motifControl || motifControl.valid) {
      return null;
    }

    return 'Le motif doit contenir au moins 10 caracteres.';
  }

  private findOverlappingRequest(): DemandeConge | null {
    const startDate = this.startDate();
    const endDate = this.endDate();
    if (!startDate || !endDate) {
      return null;
    }

    const start = startDate.toISOString().split('T')[0];
    const end = endDate.toISOString().split('T')[0];
    return this.historique.find(demande =>
      this.isBlockingStatus(demande.statut)
      && demande.dateDebut <= end
      && demande.dateFin >= start
    ) ?? null;
  }

  private isBlockingStatus(statut: DemandeConge['statut']): boolean {
    return [
      'EN_ATTENTE',
      'EN_ATTENTE_MANAGER',
      'EN_ATTENTE_RH',
      'APPROUVE',
      'APPROUVEE'
    ].includes(statut);
  }

  private generateCalendarDays(date: Date): CalendarDay[] {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    let startDay = start.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;

    const calendarStart = new Date(start);
    calendarStart.setDate(calendarStart.getDate() - startDay);

    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 42; i++) {
      const current = new Date(calendarStart);
      current.setDate(current.getDate() + i);
      current.setHours(0, 0, 0, 0);

      const dateStr = current.toISOString().split('T')[0];
      const isWeekend = current.getDay() === 0 || current.getDay() === 6;
      const holiday = this.joursFeries.find(item => item.date === dateStr);

      days.push({
        date: current,
        isCurrentMonth: current.getMonth() === date.getMonth(),
        isWeekend,
        holiday,
        isSelectable: !isWeekend && !holiday && current >= today
      });
    }

    return days;
  }

  private calculateBusinessDays(start: Date, end: Date): number {
    let count = 0;
    const finalEnd = end > start ? end : start;
    const finalStart = end > start ? start : end;
    const current = new Date(finalStart);

    while (current <= finalEnd) {
      const day = current.getDay();
      const isWeekend = day === 0 || day === 6;
      const dateStr = current.toISOString().split('T')[0];
      const isHoliday = this.joursFeries.some(item => item.date === dateStr);

      if (!isWeekend && !isHoliday) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  private resolveDraftType(typeLabel?: string, typeCongeId?: number): any | null {
    const types = this.leaveTypes();
    if (typeCongeId) {
      const found = types.find(t => t.id === typeCongeId);
      if (found) return found;
    }

    if (!typeLabel) return null;
    const normalized = this.normalize(typeLabel);
    
    // Look for exact or partial match in libelle
    return types.find(t => {
      const tLib = this.normalize(t.libelle);
      return tLib.includes(normalized) || normalized.includes(tLib);
    }) || null;
  }

  private toDate(value?: string): Date | null {
    if (!value) {
      return null;
    }
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private normalize(value?: string): string {
    return typeof value === 'string'
      ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
      : '';
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    const source = (error ?? {}) as Record<string, any>;
    return source?.['error']?.['message'] || source?.['message'] || fallback;
  }
}
