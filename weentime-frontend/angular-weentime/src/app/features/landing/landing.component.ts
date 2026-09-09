import { Component, HostListener, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ThemeService } from '../../core/services/theme.service';
import { LanguageService } from '../../core/services/language.service';

export interface DashboardRequest {
    id: number;
    name: string;
    role: string;
    type: string;
    dates: string;
    status: 'Approuvé' | 'En attente' | 'Refusé';
    avatar: string;
    color: string;
}

export interface AiChatMessage {
    sender: 'user' | 'assistant';
    text?: string;
    bulletPoints?: string[];
    actionQuestion?: string;
    actions?: string[];
    time: string;
}

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
    demoVideoModalOpen = false;

    // Interactive Dashboard View Tab State
    activeDashTab = signal<'overview' | 'conges' | 'pointage' | 'ai' | 'docs' | 'workflow'>('overview');

    // Interactive Demo Leave Requests
    leaveRequests = signal<DashboardRequest[]>([
        { id: 1, name: 'Sami Mansour', role: 'Dev Senior', type: 'Congé annuel', dates: '28 Mar - 02 Avr', status: 'En attente', avatar: 'SM', color: '#F59E0B' },
        { id: 2, name: 'Chaima Bouallegue', role: 'Lead Design', type: 'Remote', dates: '29 Mar - 30 Mar', status: 'Approuvé', avatar: 'CB', color: '#10B981' },
        { id: 3, name: 'Youssef Karray', role: 'RH Manager', type: 'Maladie', dates: '27 Mar - 28 Mar', status: 'Approuvé', avatar: 'YK', color: '#10B981' },
        { id: 4, name: 'Ines Dridi', role: 'QA Engineer', type: 'Congé sans solde', dates: '05 Avr - 10 Avr', status: 'En attente', avatar: 'ID', color: '#F59E0B' }
    ]);

    // Live Check-in State
    isCheckedIn = signal<boolean>(true);
    checkInTime = signal<string>('08:42:15');

    // AI Interactive Assistant State
    isVoiceActive = signal<boolean>(false);
    aiActionExecuted = signal<string | null>(null);

    aiChatHistory = signal<AiChatMessage[]>([
        {
            sender: 'user',
            text: 'Qui est absent aujourd’hui ?',
            time: '09:14'
        },
        {
            sender: 'assistant',
            text: 'Aujourd’hui :',
            bulletPoints: [
                '12 employés sont en congé',
                '3 demandes attendent votre validation',
                '2 documents sont prêts à signer'
            ],
            actionQuestion: 'Souhaitez-vous prévenir automatiquement les managers ?',
            actions: ['Prévenir les managers', 'Voir la liste des absents', 'Signer les 2 documents'],
            time: '09:14'
        }
    ]);

    // Prompts presets for AI Section
    aiPrompts = [
        { label: 'Qui est absent aujourd’hui ?', id: 'absents' },
        { label: 'Générer le rapport de présence Q1', id: 'report' },
        { label: 'Valider les congés en attente', id: 'approve' },
        { label: 'Statistiques de télétravail', id: 'remote' }
    ];

    // Stats Logic (Exact KPIs requested by User Prompt)
    stats = [
        { value: 0, target: 250, prefix: '+', label: 'Entreprises', suffix: '', desc: 'dans la région' },
        { value: 0, target: 50, prefix: '', label: 'Employés', suffix: ' 000', desc: 'actifs au quotidien' },
        { value: 0, target: 98, prefix: '', label: 'Satisfaction', suffix: ' %', desc: 'taux de rétention' },
        { value: 0, target: 40, prefix: '+', label: 'Productivité', suffix: ' %', desc: 'de gain d’efficacité' },
        { value: 0, target: 70, prefix: '-', label: 'Temps administratif', suffix: ' %', desc: 'd’heures économisées' }
    ];

    // 13 Modules for Bento Grid
    modules = [
        {
            title: 'Assistant IA Vocal & Textuel',
            badge: 'NLP & Synthèse Vocale 2026',
            desc: 'Interragissez par la voix ou par chat. Demandez les sols de congé, préparez la paie et prévenez les retards à la voix en Français, Anglais et Arabe.',
            icon: 'bot',
            color: 'from-indigo-500 to-purple-600',
            bgGlow: 'rgba(99, 102, 241, 0.15)',
            cols: 'lg:col-span-8',
            type: 'ai-voice'
        },
        {
            title: 'Pointage Intelligent GPS & Web',
            badge: 'Geofencing & Horodatage',
            desc: 'Check-in instantané sécurisé par géolocalisation ou terminal physique. Détection automatique des retards et heures sup.',
            icon: 'clock',
            color: 'from-emerald-500 to-teal-600',
            bgGlow: 'rgba(16, 185, 129, 0.15)',
            cols: 'lg:col-span-4',
            type: 'pointage'
        },
        {
            title: 'Congés & Absences',
            badge: 'Calcul Automatique',
            desc: 'Demandes en 1 clic, décompte dynamique selon la réglementation locale et synchronisation des plannings.',
            icon: 'calendar',
            color: 'from-blue-500 to-cyan-600',
            bgGlow: 'rgba(59, 130, 246, 0.15)',
            cols: 'lg:col-span-4',
            type: 'conges'
        },
        {
            title: 'Documents RH & Coffre-fort',
            badge: 'Stockage Chiffré',
            desc: 'Génération automatique d’attestations de travail, fiches de paie et contrats avec distribution sécurisée.',
            icon: 'file-text',
            color: 'from-amber-500 to-orange-600',
            bgGlow: 'rgba(245, 158, 11, 0.15)',
            cols: 'lg:col-span-4',
            type: 'docs'
        },
        {
            title: 'Signature Électronique',
            badge: 'Conforme eIDAS',
            desc: 'Faites signer vos contrats et avenants à distance en toute légalité et en quelques secondes.',
            icon: 'pen-tool',
            color: 'from-purple-500 to-indigo-600',
            bgGlow: 'rgba(168, 85, 247, 0.15)',
            cols: 'lg:col-span-4',
            type: 'signature'
        },
        {
            title: 'Présence & Télétravail',
            badge: 'Planning Hybride',
            desc: 'Gestion des jauges de bureaux, déclaration de jours de télétravail et suivi de présence en temps réel.',
            icon: 'users',
            color: 'from-teal-500 to-emerald-600',
            bgGlow: 'rgba(20, 184, 166, 0.15)',
            cols: 'lg:col-span-4',
            type: 'presence'
        },
        {
            title: 'Analytics & Reporting IA',
            badge: 'Prédictif & KPI Live',
            desc: 'Tableaux de bord RH prédictifs sur la masse salariale, le turnover, l’absentéisme et la rentabilité.',
            icon: 'bar-chart-3',
            color: 'from-indigo-600 to-blue-600',
            bgGlow: 'rgba(79, 70, 229, 0.15)',
            cols: 'lg:col-span-4',
            type: 'analytics'
        },
        {
            title: 'Recrutement & ATS Intelligents',
            badge: 'Parsing CV par IA',
            desc: 'Analyse automatique des candidatures, scoring des profils et planification autonome d’entretiens.',
            icon: 'user-plus',
            color: 'from-pink-500 to-rose-600',
            bgGlow: 'rgba(236, 72, 153, 0.15)',
            cols: 'lg:col-span-4',
            type: 'recrutement'
        },
        {
            title: 'Gestion Employés & Organigramme',
            badge: 'Dossier Collaborateur 360',
            desc: 'Centralisez l’historique des employés, leur département, compétences et matériel attribué.',
            icon: 'id-card',
            color: 'from-cyan-500 to-blue-500',
            bgGlow: 'rgba(6, 182, 212, 0.15)',
            cols: 'lg:col-span-4',
            type: 'employes'
        },
        {
            title: 'Workflows & Validations',
            badge: 'Moteur Multi-niveaux',
            desc: 'Configurez des règles d’approbation conditionnelles (Employé → Manager → RH → Direction).',
            icon: 'git-merge',
            color: 'from-violet-500 to-purple-700',
            bgGlow: 'rgba(139, 92, 246, 0.15)',
            cols: 'lg:col-span-4',
            type: 'workflow'
        },
        {
            title: 'Notifications Omnicanales',
            badge: 'WhatsApp, Slack & Teams',
            desc: 'Alertes instantanées sur vos canaux favoris pour valider un congé sans sortir de vos outils.',
            icon: 'bell-ring',
            color: 'from-amber-600 to-yellow-500',
            bgGlow: 'rgba(217, 119, 6, 0.15)',
            cols: 'lg:col-span-4',
            type: 'notifications'
        },
        {
            title: 'Multi-Entreprises & Filiales',
            badge: 'Multi-tenant Enterprise',
            desc: 'Supervisez plusieurs entités juridiques et filiales depuis un seul compte maître consolidé.',
            icon: 'building-2',
            color: 'from-blue-600 to-indigo-700',
            bgGlow: 'rgba(37, 99, 235, 0.15)',
            cols: 'lg:col-span-6',
            type: 'multientreprises'
        },
        {
            title: 'Multilingue & Dialectes',
            badge: 'FR · EN · AR · Dialectes',
            desc: 'Interface et IA vocale natives disponibles en Français, Anglais, Arabe et dialecte Tunisien.',
            icon: 'globe',
            color: 'from-emerald-600 to-teal-700',
            bgGlow: 'rgba(5, 150, 105, 0.15)',
            cols: 'lg:col-span-6',
            type: 'multilingue'
        }
    ];

    partners = ['TechCorp', 'MediPlus', 'GreenEnergy'];
    logos = [...this.partners, ...this.partners];

    pills = [
        { i: '🎙️', t: 'Assistant Vocal RH IA', c: '#6366F1' },
        { i: '⏰', t: 'Pointage Smart GPS', c: '#10B981' },
        { i: '📄', t: 'Signature eIDAS', c: '#F59E0B' },
        { i: '🌍', t: 'FR · EN · AR · Dialectes', c: '#8B5CF6' }
    ];

    advantages = [
        { t: 'Productivité Boostée', d: '+40% de gain de temps sur la gestion RH et administrative.', i: 'zap', s: '+40% Productivité' },
        { t: 'Conformité 100% Garantie', d: 'Mises à jour réglementaires et Code du travail intégrés.', i: 'shield-check', s: '100% Conforme' },
        { t: 'Digitalisation Zéro Papier', d: 'Processus de paie, congés et contrats entièrement dématérialisés.', i: 'sparkles', s: '-70% Admin' },
        { t: 'Mobile First & Cloud', d: 'Accessible 24/7 sur iOS, Android et Web avec synchronisation temps réel.', i: 'smartphone', s: 'Disponible 24/7' },
        { t: 'Analytics Intelligents', d: 'Prévisions d’absentéisme et tableaux de bord décisionnels.', i: 'bar-chart-2', s: '+25 KPI Live' },
        { t: 'Accompagnement Dédié', d: 'Support entreprise ultra-réactif et intégration personnalisée.', i: 'headphones', s: '< 15 min Réponse' }
    ];

    feedback = [
        { n: 'Sami Ben Ali', r: 'DRH, Poulina Group', m: 'WeenTime a divisé par 3 le temps consacré aux demandes de congé. L’assistant IA vocal est bluffant d’efficacité.', f: 'SB', logo: 'Poulina' },
        { n: 'Leila Mansour', r: 'Directrice RH, GFI Software', m: 'La dématérialisation des signatures et le pointage GPS ont transformé la gestion de nos 450 collaborateurs.', f: 'LM', logo: 'GFI' },
        { n: 'Mehdi Karray', r: 'Ops Manager, Ooredoo', m: 'L’interface 2026 est ultra-fluide. Nos managers valident tout en un clic depuis leur mobile.', f: 'MK', logo: 'Ooredoo' },
        { n: 'Ines Dridi', r: 'HR Business Partner, Telnet', m: 'La conformité légale automatique et le support local font de WeenTime le partenaire idéal.', f: 'ID', logo: 'Telnet' },
        { n: 'Yassine Belhadj', r: 'Directeur Général, BIAT Services', m: 'Une sécurité des données au niveau bancaire et un onboarding des employés réalisé sans accroc.', f: 'YB', logo: 'BIAT' },
        { n: 'Fatma Ayed', r: 'Responsable Paie, Attijari Bank', m: 'Génération instantanée des fiches et visibilité parfaite sur la présence des équipes en télétravail.', f: 'FA', logo: 'Attijari' }
    ];

    @HostListener('window:scroll', [])
    onWindowScroll() {
        this.scrolled = window.scrollY > 50;
        this.triggerCountUp();
    }

    ngOnInit(): void {
        this.triggerCountUp();
    }

    setDashboardTab(tab: 'overview' | 'conges' | 'pointage' | 'ai' | 'docs' | 'workflow') {
        this.activeDashTab.set(tab);
    }

    approveRequest(id: number) {
        this.leaveRequests.update(reqs =>
            reqs.map(r => r.id === id ? { ...r, status: 'Approuvé' as const, color: '#10B981' } : r)
        );
    }

    rejectRequest(id: number) {
        this.leaveRequests.update(reqs =>
            reqs.map(r => r.id === id ? { ...r, status: 'Refusé' as const, color: '#EF4444' } : r)
        );
    }

    toggleCheckIn() {
        this.isCheckedIn.update(v => !v);
        if (this.isCheckedIn()) {
            const now = new Date();
            this.checkInTime.set(now.toTimeString().split(' ')[0]);
        }
    }

    toggleVoiceAssistant() {
        this.isVoiceActive.update(v => !v);
    }

    executeAiAction(action: string) {
        this.aiActionExecuted.set(action);
        setTimeout(() => this.aiActionExecuted.set(null), 4000);
    }

    selectAiPrompt(promptId: string) {
        if (promptId === 'absents') {
            this.aiChatHistory.set([
                { sender: 'user', text: 'Qui est absent aujourd’hui ?', time: '10:02' },
                {
                    sender: 'assistant',
                    text: 'Aujourd’hui :',
                    bulletPoints: [
                        '12 employés sont en congé',
                        '3 demandes attendent votre validation',
                        '2 documents sont prêts à signer'
                    ],
                    actionQuestion: 'Souhaitez-vous prévenir automatiquement les managers ?',
                    actions: ['Prévenir les managers', 'Voir la liste des absents', 'Signer les 2 documents'],
                    time: '10:02'
                }
            ]);
        } else if (promptId === 'report') {
            this.aiChatHistory.set([
                { sender: 'user', text: 'Générer le rapport de présence Q1', time: '10:04' },
                {
                    sender: 'assistant',
                    text: 'Le rapport du 1er trimestre 2026 est prêt :',
                    bulletPoints: [
                        'Taux de présence global : 96.4%',
                        'Télétravail moyen : 1.8 jour / semaine / employé',
                        'Taux d’absentéisme en baisse de 3.2%'
                    ],
                    actionQuestion: 'Exporter ce rapport au format PDF ou l’envoyer à la Direction ?',
                    actions: ['Télécharger le PDF', 'Envoyer par e-mail'],
                    time: '10:04'
                }
            ]);
        } else if (promptId === 'approve') {
            this.aiChatHistory.set([
                { sender: 'user', text: 'Valider les congés en attente', time: '10:05' },
                {
                    sender: 'assistant',
                    text: 'Il y a 3 demandes de congé valides qui respectent les quotas :',
                    bulletPoints: [
                        'Sami Mansour (28 Mar - 02 Avr) · Solde suffisant',
                        'Ines Dridi (05 Avr - 10 Avr) · Remplacement confirmé',
                        'Karim Belhadj (12 Avr - 15 Avr) · Équipe à 90% disponible'
                    ],
                    actionQuestion: 'Approuver les 3 demandes simultanément ?',
                    actions: ['Valider les 3 demandes', 'Examiner une par une'],
                    time: '10:05'
                }
            ]);
        } else if (promptId === 'remote') {
            this.aiChatHistory.set([
                { sender: 'user', text: 'Statistiques de télétravail', time: '10:07' },
                {
                    sender: 'assistant',
                    text: 'Aujourd’hui 18 collaborateurs sont en Remote :',
                    bulletPoints: [
                        'Département Tech : 12 personnes',
                        'Département Marketing : 4 personnes',
                        'Capacité bureau occupée à 68%'
                    ],
                    actionQuestion: 'Consulter la carte interactive des espaces réservés ?',
                    actions: ['Voir la carte des bureaux', 'Notifier les chefs de projet'],
                    time: '10:07'
                }
            ]);
        }
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
        const names = ['SB', 'LM', 'MK', 'ID', 'YB', 'FA'];
        return names[index % names.length];
    }

    getInitials(name: string): string {
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    }

    onVideoClick() {
        this.demoVideoModalOpen = true;
    }

    closeDemoModal() {
        this.demoVideoModalOpen = false;
    }
}

