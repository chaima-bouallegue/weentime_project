import { Routes } from '@angular/router';
import { LandingComponent } from './features/landing/landing.component';
import { PricingComponent } from './features/pricing/pricing.component';
import { ShellComponent } from './features/shell/shell.component';
import {authGuard} from '@app/core/guards/auth.guard';
import {roleGuard} from '@app/core/guards/role.guard';

export const routes: Routes = [
    {
        path: '',
        title: 'WeenTime — Le temps de vos talents',
        component: LandingComponent
    },
    {
        path: 'pricing',
        component: PricingComponent
    },
    {
        path: 'careers',
        title: 'WeenTime — Carrières',
        loadComponent: () => import('./features/recrutement-public/components/careers/careers.component').then(m => m.CareersComponent)
    },
    {
        path: 'careers/:id',
        title: 'WeenTime — Détail de l\'offre',
        loadComponent: () => import('./features/recrutement-public/components/job-detail/job-detail.component').then(m => m.JobDetailPublicComponent)
    },
    {
        path: 'careers/:id/apply',
        title: 'WeenTime — Postuler',
        loadComponent: () => import('./features/recrutement-public/components/apply/apply.component').then(m => m.ApplyComponent)
    },
    {
        path: 'login',
        title: 'WeenTime — Connexion',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
        data: { hideLayout: true }
    },
    {
        path: 'register',
        title: 'WeenTime — Créer un compte',
        loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
        data: { hideLayout: true }
    },
    {
        path: 'auth/verify-2fa',
        title: 'WeenTime — Vérification',
        loadComponent: () => import('./features/auth/verify-2fa/verify-2fa.component').then(m => m.Verify2faComponent),
        data: { hideLayout: true }
    },
    {
        path: 'app',
        component: ShellComponent,
        data: { hideLayout: true },
        canActivate: [authGuard],
        canActivateChild: [roleGuard],
        loadChildren: () => import('./features/shell/shell.routes').then(m => m.shellRoutes)
    },
    { path: '**', redirectTo: '' }
];
