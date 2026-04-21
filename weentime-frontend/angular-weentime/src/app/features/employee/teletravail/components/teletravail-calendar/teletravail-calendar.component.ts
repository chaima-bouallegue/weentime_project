import { Component, Input, OnInit, ChangeDetectionStrategy, signal, computed, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, ChevronLeft, ChevronRight, Calendar, Info, Monitor, Home } from 'lucide-angular';

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isRemote: boolean;
  isHalfDay?: boolean;
}


@Component({
  selector: 'app-teletravail-calendar',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './teletravail-calendar.component.html',
  styleUrl: './teletravail-calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class TeletravailCalendarComponent implements OnInit {
  @Input() approvedDates: string[] = []; // YYYY-MM-DD
  @Input() halfDayDates: { date: string, periode: 'MATIN' | 'APRES_MIDI' }[] = [];
  @Input() holidayDates: string[] = [];

  // Icons
  readonly iconChevronLeft = ChevronLeft;
  readonly iconChevronRight = ChevronRight;
  readonly iconCalendar = Calendar;
  readonly iconInfo = Info;
  readonly iconMonitor = Monitor;
  readonly iconHome = Home;

  viewDate = signal(new Date());

  days = computed(() => {
    const date = this.viewDate();
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    const days: CalendarDay[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(date.getFullYear(), date.getMonth(), 0);
    const prevPadding = (start.getDay() + 6) % 7;
    for (let i = prevPadding - 1; i >= 0; i--) {
      days.push(this.createDay(new Date(prevMonthLastDay.getFullYear(), prevMonthLastDay.getMonth(), prevMonthLastDay.getDate() - i), false));
    }

    // Current month
    for (let i = 1; i <= end.getDate(); i++) {
      days.push(this.createDay(new Date(date.getFullYear(), date.getMonth(), i), true));
    }

    // Next month padding
    const nextPadding = 42 - days.length;
    for (let i = 1; i <= nextPadding; i++) {
      days.push(this.createDay(new Date(date.getFullYear(), date.getMonth() + 1, i), false));
    }

    return days;
  });

  ngOnInit(): void { }

  private createDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    const dStr = date.toISOString().split('T')[0];
    const today = new Date();
    const isToday = dStr === today.toISOString().split('T')[0];
    const day = date.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = this.holidayDates.includes(dStr);
    const isRemote = this.approvedDates.includes(dStr);
    const halfDay = this.halfDayDates.find(h => h.date === dStr);

    return {
      date,
      isCurrentMonth,
      isToday,
      isWeekend,
      isHoliday,
      isRemote,
      isHalfDay: !!halfDay
    };
  }

  nextMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  prevMonth(): void {
    const d = this.viewDate();
    this.viewDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  getMonthLabel(): string {
    return this.viewDate().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
  }
}
