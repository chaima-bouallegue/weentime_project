import { Injectable, signal, computed } from '@angular/core';

export type Lang = 'FR' | 'EN' | 'AR';

const translations: Record<Lang, Record<string, string>> = {
    FR: {
        'nav.features': 'Fonctionnalités',
        'nav.pricing': 'Tarifs',
        'nav.about': 'À propos',
        'nav.login': 'Connexion',
        'nav.trial': 'Essai gratuit',
        'hero.title': 'Gérez vos RH intelligemment',
        'hero.subtitle': 'La plateforme RH tout-en-un pour les entreprises modernes. Simplifiez la gestion, optimisez les équipes.',
        'hero.cta1': 'Démarrer →',
        'hero.cta2': 'Voir démo',
    },
    EN: {
        'nav.features': 'Features',
        'nav.pricing': 'Pricing',
        'nav.about': 'About',
        'nav.login': 'Login',
        'nav.trial': 'Free Trial',
        'hero.title': 'Manage your HR Intelligently',
        'hero.subtitle': 'The all-in-one HR platform for modern companies. Simplify management, optimize teams.',
        'hero.cta1': 'Get Started →',
        'hero.cta2': 'View Demo',
    },
    AR: {
        'nav.features': 'المميزات',
        'nav.pricing': 'الأسعار',
        'nav.about': 'حول',
        'nav.login': 'تسجيل الدخول',
        'nav.trial': 'تجربة مجانية',
        'hero.title': 'أدر مواردك البشرية بذكاء',
        'hero.subtitle': 'المنصة الشاملة للموارد البشرية للشركات الحديثة. بسّط الإدارة، طوّر الفرق.',
        'hero.cta1': 'ابدأ الآن →',
        'hero.cta2': 'مشاهدة العرض',
    },
};

@Injectable({
    providedIn: 'root'
})
export class LanguageService {
    private readonly STORAGE_KEY = 'weentime-lang';
    lang = signal<Lang>((localStorage.getItem(this.STORAGE_KEY) as Lang) || 'FR');

    isRTL = computed(() => this.lang() === 'AR');

    setLanguage(l: Lang) {
        this.lang.set(l);
        localStorage.setItem(this.STORAGE_KEY, l);
        document.documentElement.setAttribute('dir', this.isRTL() ? 'rtl' : 'ltr');
    }

    translate(key: string): string {
        return translations[this.lang()][key] || translations['FR'][key] || key;
    }
}
