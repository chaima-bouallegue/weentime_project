import { Component, Input, signal, computed, ChangeDetectionStrategy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ChevronLeft, ChevronRight } from 'lucide-angular';
import { DemandeConge, JourFerie } from '../../models/conge.model';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holiday?: JourFerie;
  absences: DemandeConge[];
}

@Component({
  selector: 'app-conge-calendar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './conge-calendar.component.html',
  styleUrl: './conge-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class CongeCalendarComponent implements OnInit {
  readonly iconLeft = ChevronLeft;
  readonly iconRight = ChevronRight;
  @Input() demandes: DemandeConge[] = [];
  @Input() joursFeries: JourFerie[] = [];

  viewDate = signal(new Date());
  days = computed(() => this.generateDays(this.viewDate()));

  weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  ngOnInit() {}

  prevMonth() {
    const d = new Date(this.viewDate());
    d.setMonth(d.getMonth() - 1);
    this.viewDate.set(d);
  }

  nextMonth() {
    const d = new Date(this.viewDate());
    d.setMonth(d.getMonth() + 1);
    this.viewDate.set(d);
  }

  private generateDays(date: Date): CalendarDay[] {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    
    // Start of the week (Monday)
    let startDay = start.getDay(); // 0 is Sunday
    startDay = startDay === 0 ? 6 : startDay - 1; // Normalize to 0=Mon, 6=Sun
    
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
      
      const dayDemandes = this.demandes.filter(d => {
        if (d.statut === 'REFUSE' || d.statut === 'ANNULE') return false;
        const dStart = new Date(d.dateDebut);
        const dEnd = new Date(d.dateFin);
        dStart.setHours(0,0,0,0);
        dEnd.setHours(0,0,0,0);
        return current >= dStart && current <= dEnd;
      });

      const holiday = this.joursFeries.find(jf => jf.date === dateStr);

      days.push({
        date: current,
        isCurrentMonth: current.getMonth() === date.getMonth(),
        isToday: current.getTime() === today.getTime(),
        isWeekend,
        holiday,
        absences: dayDemandes
      });
    }
    return days;
  }

  getAbsenceColor(typeNom: string): string {
    const name = typeNom.toLowerCase();
    if (name.includes('annuel')) return '#6366f1';
    if (name.includes('maladie')) return '#f59e0b';
    if (name.includes('rtt')) return '#10b981';
    if (name.includes('exceptionnel')) return '#f97316';
    if (name.includes('sans solde')) return '#94a3b8';
    if (name.includes('maternite') || name.includes('paternite')) return '#ec4899';
    return '#cbd5e1';
  }
}
