import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AdminDashboardPageComponent } from '@app/shared/ui/pages/admin-dashboard/admin-dashboard.page.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [AdminDashboardPageComponent],
  template: `<ui-admin-dashboard-page></ui-admin-dashboard-page>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboardComponent {}
