import { Component, inject, OnInit, signal, computed, ViewEncapsulation, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, SlicePipe } from '@angular/common';
import { LucideAngularModule, Calendar, Clock, Coffee, Monitor, Home, Sparkles, MapPin, ChevronRight, Info } from 'lucide-angular';
import { HoraireService } from './../../../core/services/horaire.service';
import { Horaire, JourHoraire } from './../../../core/models/horaire.model';

@Component({
  selector: 'app-employee-horaires',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, SlicePipe],
  templateUrl: './employee-horaires.component.html',
  styleUrls: ['./employee-horaires.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class EmployeeHorairesComponent implements OnInit {
  private horaireService = inject(HoraireService);

  // Icons
  readonly iconCalendar = Calendar;
  readonly iconClock = Clock;
  readonly iconCoffee = Coffee;
  readonly iconMonitor = Monitor;
  readonly iconHome = Home;
  readonly iconSparkles = Sparkles;
  readonly iconMap = MapPin;
  readonly iconChevronRight = ChevronRight;
  readonly iconInfo = Info;

  horaire = signal<Horaire | null>(null);
  isLoading = signal(true);
  currentDate = signal<string>('');

  aujourdHui = computed(() => {
    const h = this.horaire();
    if (!h) return null;

    // Simplification: Trouver le jour de la semaine actuel. Lundi = 1
    const jsDay = new Date().getDay(); // 0 = Dimanche, 1 = Lundi, etc.
    const jours: Record<number, string> = { 1: 'LUNDI', 2: 'MARDI', 3: 'MERCREDI', 4: 'JEUDI', 5: 'VENDREDI', 6: 'SAMEDI', 0: 'DIMANCHE' };
    const currentJourName = jours[jsDay];

    return h.jours.find(j => j.jourSemaine === currentJourName) || null;
  });

  ngOnInit(): void {
    const now = new Date();
    this.currentDate.set(now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    this.horaireService.resolveHoraire().subscribe({
      next: (data: Horaire) => {
        this.horaire.set(data);
        this.isLoading.set(false);
      },
      error: () => {
        this.horaire.set(null);
        this.isLoading.set(false);
      }
    });
  }

  isToday(jourStr: string): boolean {
    const jsDay = new Date().getDay();
    const jours: Record<number, string> = { 1: 'LUNDI', 2: 'MARDI', 3: 'MERCREDI', 4: 'JEUDI', 5: 'VENDREDI', 6: 'SAMEDI', 0: 'DIMANCHE' };
    return jours[jsDay] === jourStr;
  }

  getHeureDebut(jour: JourHoraire | null | undefined): string | null {
    if (!jour || !jour.plages) return null;
    const travails = jour.plages.filter((p: any) => p.type === 'TRAVAIL');
    if (travails.length === 0) return null;
    return travails.map((p: any) => p.heureDebut).sort()[0];
  }

  getHeureFin(jour: JourHoraire | null | undefined): string | null {
    if (!jour || !jour.plages) return null;
    const travails = jour.plages.filter((p: any) => p.type === 'TRAVAIL');
    if (travails.length === 0) return null;
    return travails.map((p: any) => p.heureFin).sort().reverse()[0];
  }

  getDureePauseMinutes(jour: JourHoraire | null | undefined): number {
    if (!jour || !jour.plages) return 0;
    const pauses = jour.plages.filter((p: any) => p.type === 'PAUSE');
    let minutes = 0;
    pauses.forEach((p: any) => {
      const [h1, m1] = p.heureDebut.split(':').map(Number);
      const [h2, m2] = p.heureFin.split(':').map(Number);
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diff < 0) diff += 24 * 60;
      minutes += diff;
    });
    return minutes;
  }
}
