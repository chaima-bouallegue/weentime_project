import { Routes } from '@angular/router';
import { CareersComponent } from './components/careers/careers.component';
import { ApplyComponent } from './components/apply/apply.component';
import { JobDetailPublicComponent } from './components/job-detail/job-detail.component';

export const PUBLIC_RECRUTEMENT_ROUTES: Routes = [
  { path: 'careers', component: CareersComponent },
  { path: 'careers/:id', component: JobDetailPublicComponent },
  { path: 'careers/:id/apply', component: ApplyComponent }
];
