import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ManagerDashboardPageComponent } from '@app/shared/ui/pages/manager-dashboard/manager-dashboard.page.component';

@Component({
  selector: 'app-manager-dashboard',
  standalone: true,
  imports: [ManagerDashboardPageComponent],
  template: `<ui-manager-dashboard-page></ui-manager-dashboard-page>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ManagerDashboardComponent {}
