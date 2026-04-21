import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService } from '../../core/services/theme.service';

@Component({
    selector: 'app-pricing',
    standalone: true,
    imports: [CommonModule, LucideAngularModule],
    templateUrl: './pricing.component.html'
})
export class PricingComponent {
    themeService = inject(ThemeService);
    isAnnual = signal(false);

    pricingPlans = [
        { n: 'Starter', p: 49, py: 490, f: ['Jusqu\'à 20 employés', 'Gestion des congés', 'Support par chat'] },
        { n: 'Pro', p: 99, py: 990, f: ['Jusqu\'à 100 employés', 'Pointage GPS', 'Assistant Vocal', 'Analytiques'], popular: true },
        { n: 'Enterprise', p: 199, py: 1990, f: ['Illimité', 'Paie automatisée', 'API personnalisée', 'Account Manager'] }
    ];

    togglePricing() {
        this.isAnnual.set(!this.isAnnual());
    }
}
