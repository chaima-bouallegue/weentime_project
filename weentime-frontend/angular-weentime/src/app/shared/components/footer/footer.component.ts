import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { LogoComponent } from '../logo/logo.component';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
    selector: 'app-footer',
    standalone: true,
    imports: [CommonModule, RouterModule, LucideAngularModule, LogoComponent],
    templateUrl: './footer.component.html',
    styles: [`
    :host { display: block; }
  `]
})
export class FooterComponent {
    themeService = inject(ThemeService);

    socialIcons = ['facebook', 'twitter', 'linkedin', 'github'];

    footerLinks = [
        {
            title: 'Produit',
            links: [
                { label: 'Fonctionnalités', path: '/#features' },
                { label: 'Tarif', path: '/pricing' },
                { label: 'Blog', path: '/blog' }
            ]
        },
        {
            title: 'Ressources',
            links: [
                { label: 'Guide', path: '/guide' },
                { label: 'Support', path: '/support' },
                { label: 'API', path: '/api' }
            ]
        },
        {
            title: 'Entreprise',
            links: [
                { label: 'À propos', path: '/about' },
                { label: 'Contact', path: '/contact' },
                { label: 'Careers', path: '/careers' }
            ]
        }
    ];
}
