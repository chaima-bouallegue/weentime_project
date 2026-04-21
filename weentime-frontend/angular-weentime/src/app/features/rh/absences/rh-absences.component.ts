import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RhAbsenceListComponent } from './components/absence-list/absence-list.component';
import { RhAbsenceFormComponent } from './components/absence-form/absence-form.component';

@Component({
  selector: 'app-rh-absences',
  standalone: true,
  imports: [CommonModule, RhAbsenceListComponent, RhAbsenceFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showForm()) {
      <app-rh-absence-form (close)="showForm.set(false)" (saved)="onSaved()" />
    } @else {
      <app-rh-absence-list (addNew)="showForm.set(true)" />
    }
  `,
  styles: [`:host { display: block; }`]
})
export class RhAbsencesComponent {
  showForm = signal(false);

  onSaved(): void {
    this.showForm.set(false);
  }
}
