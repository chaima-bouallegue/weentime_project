import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EmployeeDashboardPageComponent } from '@app/shared/ui/pages/employee-dashboard/employee-dashboard.page.component';

@Component({
  selector: 'app-employee-dashboard',
  standalone: true,
  imports: [EmployeeDashboardPageComponent],
  template: `<ui-employee-dashboard-page></ui-employee-dashboard-page>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmployeeDashboardComponent {}
