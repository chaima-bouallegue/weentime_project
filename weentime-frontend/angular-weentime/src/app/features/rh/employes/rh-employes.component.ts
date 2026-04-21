import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmployesComponent } from '../structure/components/employes/employes.component';

@Component({
  selector: 'app-rh-employes',
  standalone: true,
  imports: [EmployesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-employes></app-employes>`
})
export class RhEmployesComponent {}
