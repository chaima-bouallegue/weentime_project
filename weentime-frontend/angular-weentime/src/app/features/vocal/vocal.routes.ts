import { Routes } from '@angular/router';

export const vocalRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/vocal-dashboard/vocal-dashboard.component').then(m => m.VocalDashboardComponent),
    title: 'Assistant Vocal | WeenTime'
  }
];
