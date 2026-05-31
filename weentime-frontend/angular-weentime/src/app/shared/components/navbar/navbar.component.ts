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

    navLinks = [
        { label: 'Accueil', path: '/' },
        { label: 'Présentation', path: '/', fragment: 'presentation' },
        { label: 'Fonctionnalités', path: '/', fragment: 'features' },
        { label: 'Carrières', path: '/careers' },
        { label: 'Blog', path: '/blog' }
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
