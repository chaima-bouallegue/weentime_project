import { Routes } from '@angular/router';

export const RECRUTEMENT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/job-list/job-list.component').then(m => m.JobListComponent)
  },
  {
    path: 'nouveau',
    loadComponent: () => import('./components/job-create/job-create.component').then(m => m.JobCreateComponent)
  },
  {
    path: 'modifier/:id',
    loadComponent: () => import('./components/job-create/job-create.component').then(m => m.JobCreateComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./components/job-detail/job-detail.component').then(m => m.JobDetailComponent)
  }
];
