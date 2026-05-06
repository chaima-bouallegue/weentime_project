import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RhDashboardPageComponent } from '@app/shared/ui/pages/rh-dashboard/rh-dashboard.page.component';

@Component({
  selector: 'app-rh-dashboard',
  standalone: true,
  imports: [RhDashboardPageComponent],
  template: `<ui-rh-dashboard-page></ui-rh-dashboard-page>`,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RhDashboardComponent {}
