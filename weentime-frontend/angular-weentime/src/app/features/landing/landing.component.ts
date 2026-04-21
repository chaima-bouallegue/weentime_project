import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';

@Component({
    selector: 'app-landing',
    standalone: true,
    imports: [CommonModule, RouterModule, LucideAngularModule],
    templateUrl: './landing.component.html',
    styleUrls: ['./landing.component.css']
})
export class LandingComponent implements OnInit {
    themeService = inject(ThemeService);
    langService = inject(LanguageService);

    scrolled = false;
    mobileMenu = false;

    // Stats Logic
    stats = [
        { value: 0, target: 500, label: 'Entreprises', suffix: '+' },
        { value: 0, target: 50, label: 'Utilisateurs', suffix: 'K' },
        { value: 0, target: 99, label: 'Satisfaction', suffix: '%' },
        { value: 0, target: 24, label: 'Support 7j/7', suffix: 'h' }
    ];

    sectors = [
        { name: 'Industrie', icon: 'factory', active: true },
        { name: 'Services', icon: 'briefcase', active: false },
        { name: 'Santé', icon: 'heart', active: false },
        { name: 'Retail', icon: 'shopping-cart', active: false },
        { name: 'Tech', icon: 'code', active: false },
        { name: 'Hôtellerie', icon: 'coffee', active: false }
    ];

    bentoFeatures = [
        { title: 'Assistant IA Vocal', desc: 'Prenez vos congés en parlant à votre téléphone.', icon: 'mic', class: 'lg:col-span-2 lg:row-span-2 bg-indigo-500/10' },
        { title: 'Pointage GPS', desc: 'Validation de présence géolocalisée.', icon: 'map-pin', class: 'bg-emerald-500/10' },
        { title: 'Smart Planning', desc: 'Optimisation automatique des shifts.', icon: 'calendar', class: 'bg-amber-500/10' },
        { title: 'Paie Instantanée', desc: 'Générez vos fiches en un clic.', icon: 'credit-card', class: 'lg:col-span-2 bg-purple-500/10' }
    ];

    pills = [
        { i: '🎙️', t: 'Assistant IA Vocal', c: '#6366F1' },
        { i: '⏰', t: 'Pointage Smart', c: '#10B981' },
        { i: '🌍', t: 'FR · EN · AR · TN', c: '#8B5CF6' }
    ];

    advantages = [
        { t: 'Productivité Boostée', d: '+23% de gain de temps admin.', i: 'zap', s: '+23% Productivité' },
        { t: 'Conformité Totale', d: 'Code du travail tunisien intégré.', i: 'shield', s: '100% Juridique' },
        { t: 'Zéro Papier', d: 'Processus 100% digitalisés.', i: 'leaf', s: '-40% Coûts' },
        { t: 'Mobile First', d: 'App iOS & Android ultra-rapide.', i: 'smartphone', s: 'Disponible 24/7' },
        { t: 'Analytics RH', d: 'Tableaux de bord en temps réel.', i: 'bar-chart', s: '+15 KPI Suivis' },
        { t: 'Support Local', d: 'Équipe basée à Tunis à votre écoute.', i: 'headset', s: '< 2h Réponse' }
    ];

    feedback = [
        { n: 'Sami Ben Ali', r: 'DRH, Poulina', m: 'WeenTime a révolutionné notre gestion de paie.', f: 'S' },
        { n: 'Leila Mansour', r: 'CEO, GFI Tunis', m: 'L\'assistant vocal est un game changer pour nos équipes.', f: 'L' },
        { n: 'Mehdi Karray', r: 'Ops Manager, Ooredoo', m: 'Une interface intuitive qui ne nécessite aucune formation.', f: 'M' },
        { n: 'Ines Dridi', r: 'HR Manager, Telnet', m: 'Le support local est ultra réactif, c\'est rassurant.', f: 'I' },
        { n: 'Yassine Belhadj', r: 'Directeur, BIAT', m: 'La sécurité des données est au top niveau bancaire.', f: 'Y' },
        { n: 'Fatma Ayed', r: 'Admin, Attijari', m: 'Simplifie énormément la gestion des shifts.', f: 'F' }
    ];

    partners = ['Tunisair', 'STEG', 'Ooredoo', 'Attijari', 'BIAT', 'Poulina', 'GFI', 'Telnet'];
    logos = [...this.partners, ...this.partners];

    kpis = [
        { i: '👥', l: 'Employés', v: '247', c: '#6366F1' },
        { i: '📋', l: 'Demandes', v: '12', c: '#F59E0B' },
        { i: '✅', l: 'Approuvées', v: '8', c: '#10B981' },
        { i: '⏰', l: 'En attente', v: '3', c: '#EF4444' }
    ];

    requests = [
        { n: 'Ahmed K.', t: 'Congé', s: 'Approuvé', c: '#10B981' },
        { n: 'Hayet B.', t: 'Remote', s: 'En attente', c: '#F59E0B' },
        { n: 'Youssef M.', t: 'Congé', s: 'Refusé', c: '#EF4444' }
    ];

    @HostListener('window:scroll', [])
    onWindowScroll() {
        this.scrolled = window.scrollY > 50;
        this.triggerCountUp();
    }

    ngOnInit(): void {
    }

    triggerCountUp() {
        const section = document.getElementById('live-stats');
        if (section) {
            const rect = section.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom >= 0) {
                this.stats.forEach(s => {
                    if (s.value === 0) {
                        this.animateValue(s);
                    }
                });
            }
        }
    }

    animateValue(stat: any) {
        const duration = 2000;
        const start = 0;
        const end = stat.target;
        let startTimestamp: number | null = null;
        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            stat.value = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    t(key: string): string {
        return this.langService.translate(key);
    }

    getInitial(index: number): string {
        const names = ['SB', 'AK', 'HB', 'YM', 'FA'];
        return names[index % names.length];
    }

    getInitials(name: string): string {
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    onVideoClick() {}
}
