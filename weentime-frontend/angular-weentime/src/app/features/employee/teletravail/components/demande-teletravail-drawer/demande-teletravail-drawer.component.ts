import { Component, Input, Output, EventEmitter, signal, computed, OnInit, ChangeDetectionStrategy, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X, ChevronLeft, ChevronRight, Sun, Sunrise, Sunset, Home, Calendar, Info, Send, Loader2, Monitor, AlertCircle, Sparkles, Laptop, Check } from 'lucide-angular';
import { AssistantWorkflowService } from '../../../../../core/services/assistant-workflow.service';
import { TypeTeletravail, PeriodeDemiJournee, NouvelleDemandeTeletravailRequest } from '../../models/teletravail.model';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isAlreadyRemote: boolean;
  isSelectable: boolean;
  isSelected: boolean;
  isInRange: boolean;
  isRangeStart: boolean;
  isRangeEnd: boolean;
}

@Component({
  selector: 'app-demande-teletravail-drawer',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, FormsModule],
  templateUrl: './demande-teletravail-drawer.component.html',
  styleUrl: './demande-teletravail-drawer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DemandeTeletravailDrawerComponent implements OnInit {
  @Input() joursRestants = 0;
  @Input() approvedDates: string[] = [];
  @Input() holidayDates: string[] = [];

  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<NouvelleDemandeTeletravailRequest>();

  private readonly assistantWorkflow = inject(AssistantWorkflowService);

  // Icons
  readonly iconX = X;
  readonly iconChevronLeft = ChevronLeft;
  readonly iconChevronRight = ChevronRight;
  readonly iconSun = Sun;
  readonly iconSunrise = Sunrise;
  readonly iconSunset = Sunset;
  readonly iconHome = Home;
  readonly iconCalendar = Calendar;
  readonly iconInfo = Info;
  readonly iconSend = Send;
  readonly iconLoader = Loader2;
  readonly iconMonitor = Monitor;
  readonly iconAlert = AlertCircle;
  readonly iconSparkles = Sparkles;
  readonly iconLaptop = Laptop;
  readonly iconCheck = Check;

  step = signal(1);
  selectedType = signal<TypeTeletravail | null>(null);
  selectedStartDate = signal<string | null>(null);
  selectedEndDate = signal<string | null>(null);
  periodeDemiJournee = signal<PeriodeDemiJournee>('MATIN');
  motif = signal('');
  isSubmitting = signal(false);

  viewDate = signal(new Date());

  types = [
    { value: 'JOURNEE_COMPLETE', label: 'Journée complète', icon: this.iconSun, color: 'indigo', desc: 'Toute la journée depuis chez vous' },
    { value: 'DEMI_JOURNEE_MATIN', label: 'Matinée', icon: this.iconSunrise, color: 'blue', desc: 'Matin uniquement (jusqu\'à 13h)' },
    { value: 'DEMI_JOURNEE_APRES_MIDI', label: 'Après-midi', icon: this.iconSunset, color: 'orange', desc: 'Après-midi uniquement (à partir de 13h)' },
    { value: 'SEMAINE_COMPLETE', label: 'Semaine complète', icon: this.iconHome, color: 'violet', desc: '5 jours consécutifs — justification requise' }
  ];

  calendarDays = computed(() => {
    const date = this.viewDate();
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const days: CalendarDay[] = [];
    
    const prevPadding = (start.getDay() + 6) % 7;
    for (let i = prevPadding - 1; i >= 0; i--) {
      days.push(this.createDay(new Date(date.getFullYear(), date.getMonth(), -i), false));
    }
    for (let i = 1; i <= end.getDate(); i++) {
      days.push(this.createDay(new Date(date.getFullYear(), date.getMonth(), i), true));
    }
    const nextPadding = 42 - days.length;
    for (let i = 1; i <= nextPadding; i++) {
      days.push(this.createDay(new Date(date.getFullYear(), date.getMonth() + 1, i), false));
    }
    return days;
  });

  nombreJoursSelectionnes = computed(() => {
    if (!this.selectedStartDate()) return 0;
    if (this.selectedType()?.startsWith('DEMI_JOURNEE')) return 0.5;
    if (!this.selectedEndDate()) return 1;
    
    // Simple diff (exclusive of weekends/holidays for JOURNEE_COMPLETE range)
    // But for simplicity in mock, we just calculate business days in range
    return this.calculateBusinessDays(this.selectedStartDate()!, this.selectedEndDate()!);
  });

  isStep1Valid = computed(() => !!this.selectedType() && this.joursRestants > 0);
  isStep2Valid = computed(() => !!this.selectedStartDate() && this.nombreJoursSelectionnes() <= this.joursRestants);
  isStep3Valid = computed(() => {
    const minLen = this.selectedType() === 'SEMAINE_COMPLETE' ? 20 : 10;
    return this.motif().length >= minLen;
  });

  ngOnInit(): void {
    const draft = this.assistantWorkflow.teleworkDraft();
    if (!draft) {
      return;
    }

    const type = this.resolveDraftType(draft.type);
    if (type) {
      this.selectedType.set(type);
      this.step.set(2);
      if (type === 'DEMI_JOURNEE_MATIN') {
        this.periodeDemiJournee.set('MATIN');
      } else if (type === 'DEMI_JOURNEE_APRES_MIDI') {
        this.periodeDemiJournee.set('APRES_MIDI');
      }
    }
    if (draft.dateDebut) {
      this.selectedStartDate.set(draft.dateDebut);
      const viewDate = new Date(`${draft.dateDebut}T00:00:00`);
      if (!Number.isNaN(viewDate.getTime())) {
        this.viewDate.set(viewDate);
      }
    }
    if (draft.dateFin) {
      this.selectedEndDate.set(draft.dateFin);
    }
    if (draft.motif) {
      this.motif.set(draft.motif);
    }
    if (type && draft.dateDebut && draft.dateFin) {
      this.step.set(3);
    }

    this.assistantWorkflow.clearTeleworkDraft(draft.id);
  }

  selectType(type: any): void {
    if (this.joursRestants === 0) return;
    this.selectedType.set(type);
    this.selectedStartDate.set(null);
    this.selectedEndDate.set(null);
  }

  nextStep(): void { if (this.step() < 3) this.step.update(s => s + 1); }
  prevStep(): void { if (this.step() > 1) this.step.update(s => s - 1); }

  selectDate(dStr: string): void {
    const type = this.selectedType();
    if (type?.startsWith('DEMI_JOURNEE')) {
      this.selectedStartDate.set(dStr);
      this.selectedEndDate.set(dStr);
    } else if (type === 'JOURNEE_COMPLETE') {
      if (!this.selectedStartDate() || (this.selectedStartDate() && this.selectedEndDate() !== this.selectedStartDate())) {
        this.selectedStartDate.set(dStr);
        this.selectedEndDate.set(dStr);
      } else {
        const start = new Date(this.selectedStartDate()!);
        const end = new Date(dStr);
        if (end < start) {
          this.selectedStartDate.set(dStr);
          this.selectedEndDate.set(dStr);
        } else {
          // Check max 5 days
          const days = this.calculateBusinessDays(this.selectedStartDate()!, dStr);
          if (days <= 5) this.selectedEndDate.set(dStr);
          else {
             this.selectedStartDate.set(dStr);
             this.selectedEndDate.set(dStr);
          }
        }
      }
    } else if (type === 'SEMAINE_COMPLETE') {
      const date = new Date(dStr);
      const day = date.getDay(); // 0-6 (Sun-Sat)
      const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Monday
      const monday = new Date(date.setDate(diff));
      const friday = new Date(date.setDate(diff + 4));
      this.selectedStartDate.set(monday.toISOString().split('T')[0]);
      this.selectedEndDate.set(friday.toISOString().split('T')[0]);
    }
  }

  private createDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    const dStr = date.toISOString().split('T')[0];
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = this.holidayDates.includes(dStr);
    const isAlreadyRemote = this.approvedDates.includes(dStr);
    
    let isSelected = dStr === this.selectedStartDate() || dStr === this.selectedEndDate();
    let isInRange = false;
    let isRangeStart = dStr === this.selectedStartDate();
    let isRangeEnd = dStr === this.selectedEndDate();

    if (this.selectedStartDate() && this.selectedEndDate()) {
      isInRange = dStr >= this.selectedStartDate()! && dStr <= this.selectedEndDate()!;
    }

    return {
      date,
      isCurrentMonth,
      isWeekend,
      isHoliday,
      isAlreadyRemote,
      isSelectable: isCurrentMonth && !isWeekend && !isHoliday && !isAlreadyRemote,
      isSelected,
      isInRange,
      isRangeStart,
      isRangeEnd
    };
  }

  private calculateBusinessDays(startStr: string, endStr: string): number {
    let start = new Date(startStr);
    let end = new Date(endStr);
    let count = 0;
    while (start <= end) {
      const day = start.getDay();
      if (day !== 0 && day !== 6 && !this.holidayDates.includes(start.toISOString().split('T')[0])) {
        count++;
      }
      start.setDate(start.getDate() + 1);
    }
    return count;
  }

  onSubmit(): void {
    if (!this.isStep3Valid()) return;
    this.isSubmitting.set(true);
    this.submitted.emit({
      type: this.selectedType()!,
      dateDebut: this.selectedStartDate()!,
      dateFin: this.selectedEndDate()!,
      periode: this.selectedType()?.startsWith('DEMI_JOURNEE') ? this.periodeDemiJournee() : undefined,
      motif: this.motif()
    });
  }

  getMonthLabel(): string {
    return this.viewDate().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  }

  nextMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  prevMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  private resolveDraftType(value?: string): TypeTeletravail | null {
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
    if (normalized.includes('semaine')) {
      return 'SEMAINE_COMPLETE';
    }
    if (normalized.includes('matin')) {
      return 'DEMI_JOURNEE_MATIN';
    }
    if (normalized.includes('apres')) {
      return 'DEMI_JOURNEE_APRES_MIDI';
    }
    if (normalized.includes('journee')) {
      return 'JOURNEE_COMPLETE';
    }

    return (this.types.find(type => type.value === value)?.value as TypeTeletravail | undefined) ?? null;
  }
}
