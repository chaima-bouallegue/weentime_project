import { Injectable, signal, effect } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class ThemeService {
    private readonly STORAGE_KEY = 'weentime-theme';
    isDark = signal<boolean>(this.getInitialTheme());

    constructor() {
        effect(() => {
            const dark = this.isDark();
            localStorage.setItem(this.STORAGE_KEY, dark ? 'dark' : 'light');
            if (dark) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        });
    }

    toggleTheme() {
        this.isDark.update(v => !v);
    }

    private getInitialTheme(): boolean {
        const saved = localStorage.getItem(this.STORAGE_KEY);
        return saved === 'dark';
    }
}
