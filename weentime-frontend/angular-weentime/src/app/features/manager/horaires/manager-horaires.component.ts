import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { HoraireService, EmployeeSchedule } from './../../../core/services/horaire.service';
import { JourHoraire } from './../../../core/models/horaire.model';

@Component({
  selector: 'app-manager-horaires',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './manager-horaires.component.html',
  styleUrls: ['./manager-horaires.component.scss']
})
export class ManagerHorairesComponent implements OnInit {
  private horaireService = inject(HoraireService);

  teamSchedules = signal<EmployeeSchedule[]>([]);
  isLoading = signal(true);
  loadWarning = signal<string | null>(null);

  readonly joursSemaine = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];

  ngOnInit(): void {
    this.horaireService.getTeamSchedules().subscribe({
      next: (data: EmployeeSchedule[]) => {
        this.teamSchedules.set(data);
        this.loadWarning.set(data.length === 0 ? 'Aucun horaire equipe n est disponible pour le moment.' : null);
        this.isLoading.set(false);
      },
      error: () => {
        this.teamSchedules.set([]);
        this.loadWarning.set('Les horaires equipe ne peuvent pas etre charges actuellement.');
        this.isLoading.set(false);
      }
    });
  }

  getJourForEmployee(emp: EmployeeSchedule, jourStr: string): JourHoraire | undefined {
    return emp.horaire.jours.find((j: JourHoraire) => j.jourSemaine === jourStr);
  }

  isToday(jourStr: string): boolean {
    const jsDay = new Date().getDay();
    const jours: Record<number, string> = { 1: 'LUNDI', 2: 'MARDI', 3: 'MERCREDI', 4: 'JEUDI', 5: 'VENDREDI', 6: 'SAMEDI', 0: 'DIMANCHE' };
    return jours[jsDay] === jourStr;
  }

  getHeureDebut(jour: JourHoraire | undefined): string | null {
    if (!jour || !jour.plages) return null;
    const travails = jour.plages.filter((p: any) => p.type === 'TRAVAIL');
    if (travails.length === 0) return null;
    return travails.map((p: any) => p.heureDebut).sort()[0];
  }

  getHeureFin(jour: JourHoraire | undefined): string | null {
    if (!jour || !jour.plages) return null;
    const travails = jour.plages.filter((p: any) => p.type === 'TRAVAIL');
    if (travails.length === 0) return null;
    return travails.map((p: any) => p.heureFin).sort().reverse()[0];
  }
}
