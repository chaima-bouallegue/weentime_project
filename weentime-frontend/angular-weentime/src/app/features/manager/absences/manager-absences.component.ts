import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ManagerAbsenceListComponent } from './components/manager-absence-list/manager-absence-list.component';
import { ManagerAbsenceFormComponent } from './components/manager-absence-form/manager-absence-form.component';

@Component({
  selector: 'app-manager-absences',
  standalone: true,
  imports: [CommonModule, ManagerAbsenceListComponent, ManagerAbsenceFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showForm()) {
      <app-manager-absence-form (close)="showForm.set(false)" (saved)="onSaved()" />
    } @else {
      <app-manager-absence-list (addNew)="showForm.set(true)" />
    }
  `,
  styles: [`:host { display: block; }`]
})
export class ManagerAbsencesComponent {
  showForm = signal(false);

  onSaved(): void {
    this.showForm.set(false);
  }
}
