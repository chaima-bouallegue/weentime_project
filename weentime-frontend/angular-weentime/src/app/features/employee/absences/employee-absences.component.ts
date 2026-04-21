import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EmployeAbsenceListComponent } from './components/employe-absence-list/employe-absence-list.component';
import { EmployeAbsenceFormComponent } from './components/employe-absence-form/employe-absence-form.component';

@Component({
  selector: 'app-employee-absences',
  standalone: true,
  imports: [CommonModule, EmployeAbsenceListComponent, EmployeAbsenceFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showForm()) {
      <app-employe-absence-form (close)="showForm.set(false)" (saved)="onSaved()" />
    } @else {
      <app-employe-absence-list (addNew)="showForm.set(true)" />
    }
  `,
  styles: [`:host { display: block; }`]
})
export class EmployeeAbsencesComponent {
  showForm = signal(false);

  onSaved(): void {
    this.showForm.set(false);
  }
}
