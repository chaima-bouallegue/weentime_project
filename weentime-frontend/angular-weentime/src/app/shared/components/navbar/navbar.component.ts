import { Component, HostListener, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService } from '../../../core/services/theme.service';
import { LanguageService } from '../../../core/services/language.service';
import { LogoComponent } from '../logo/logo.component';

@Component({
    selector: 'app-navbar',
    standalone: true,
    imports: [CommonModule, RouterModule, LucideAngularModule, LogoComponent],
    templateUrl: './navbar.component.html',
    styles: [`
    :host { display: block; }
    .lang-tab {
      @apply px-3 py-1 rounded-full text-xs font-bold transition-all;
    }
    .lang-tab-active {
      @apply bg-white dark:bg-white/10 shadow-sm text-indigo-600 dark:text-white;
    }
    .nav-link {
        @apply transition-colors duration-200;
    }
    .nav-link-active {
        @apply text-indigo-600 dark:text-indigo-400 font-bold !important;
    }
    .nav-link-active span {
        @apply scale-x-100 !important;
    }
    .drawer-enter {
        animation: drawerFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes drawerFadeIn {
        from { opacity: 0; transform: translateY(8px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
    }
  `]
})
export class NavbarComponent {
    themeService = inject(ThemeService);
    langService = inject(LanguageService);
    private router = inject(Router);

    isActive(path: string, fragment?: string): boolean {
        const url = this.router.url;
        const currentPath = url.split('#')[0].split('?')[0];
        
        if (currentPath !== path) {
            return false;
        }

        const currentHash = window.location.hash;

        if (fragment) {
            return currentHash === '#' + fragment;
        } else {
            return currentHash === '' || currentHash === '#';
        }
    }

    scrolled = false;

    langFlags = [
        { code: 'FR', label: 'FR' },
        { code: 'EN', label: 'EN' },
        { code: 'AR', label: 'AR' },
    ];

    featuresDrawer = {
        groups: [
            {
                title: 'Temps & Présence',
                items: [
                    { label: 'Pointage mobile', desc: 'Géolocalisation, NFC, QR code', icon: 'map-pin', route: '/', fragment: 'features' },
                    { label: 'Planning', desc: 'Horaires et absences centralisés', icon: 'clock', route: '/', fragment: 'features' },
                ]
            },
            {
                title: 'Congés & Télétravail',
                items: [
                    { label: 'Demandes de congés', desc: 'Workflow validation intelligent', icon: 'calendar', route: '/', fragment: 'features' },
                    { label: 'Télétravail', desc: 'Planification et suivi', icon: 'home', route: '/', fragment: 'features' },
                ]
            },
            {
                title: 'RH & Documents',
                items: [
                    { label: 'Documents RH', desc: 'Génération IA + signature', icon: 'file-text', route: '/', fragment: 'features' },
                    { label: 'Recrutement', desc: 'Scoring CV par IA', icon: 'users', route: '/', fragment: 'features' },
                ]
            },
            {
                title: 'IA & Analytics',
                items: [
                    { label: 'Assistant IA', desc: 'Vocal, prédictions, alertes', icon: 'sparkles', route: '/', fragment: 'assistant-ia' },
                    { label: 'Tableaux de bord', desc: 'Métriques en temps réel', icon: 'bar-chart-3', route: '/', fragment: 'features' },
                ]
            },
        ]
    };

    featuresDropdownOpen = signal(false);

    navLinks = [
        { label: 'Accueil', path: '/' },
        { label: 'Présentation', path: '/presentation' },
        { label: 'Fonctionnalités', path: '/', fragment: 'features', hasDrawer: true },
        { label: 'Carrières', path: '/careers' }
    ];

    @HostListener('window:scroll', [])
    onWindowScroll() {
        this.scrolled = window.scrollY > 50;
    }

    toggleTheme() {
        this.themeService.toggleTheme();
    }

    setLang(lang: string) {
        this.langService.setLanguage(lang as any);
    }
}
