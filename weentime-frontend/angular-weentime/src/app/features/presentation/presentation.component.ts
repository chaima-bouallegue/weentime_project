import { Component, AfterViewInit, ElementRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';

interface DemoNavTab {
  id: string;
  label: string;
  icon: string;
}

interface Feature {
  id: string;
  title: string;
  desc: string;
  icon: string;
  items: string[];
}

@Component({
  selector: 'app-presentation',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, LucideAngularModule],
  templateUrl: './presentation.component.html',
  styleUrls: ['./presentation.component.css']
})
export class PresentationComponent implements AfterViewInit {
  constructor(private el: ElementRef) {}

  /* ─── DEMO TABS ─── */
  demoNavTabs: DemoNavTab[] = [
    { id: 'overview', label: 'Vue d\'ensemble', icon: 'layout-dashboard' },
    { id: 'conges', label: 'Congés', icon: 'calendar' },
    { id: 'pointage', label: 'Pointage', icon: 'clock' },
    { id: 'ai', label: 'Assistant IA', icon: 'bot' },
  ];

  activeDemoTab = signal<string>('overview');
  get activeDemoTabLabel(): string {
    return this.demoNavTabs.find(t => t.id === this.activeDemoTab())?.label ?? '';
  }
  setDemoTab(id: string) { this.activeDemoTab.set(id); }

  /* ─── FLOATING CARDS (hero) ─── */
  floatingCards = [
    { icon: 'check-circle', text: 'Demande validée', sub: 'Sarah K. — Congé approuvé', color: 'emerald' },
    { icon: 'clock', text: '+8h supplémentaires', sub: 'Thomas R. — Heures compl.', color: 'indigo' },
    { icon: 'trending-up', text: 'Présence 92%', sub: 'Prévision IA J+7', color: 'violet' },
    { icon: 'user-plus', text: 'Nouvel employé', sub: 'Léa M. — Intégrée', color: 'emerald' },
    { icon: 'home', text: 'Télétravail approuvé', sub: 'Ahmed M. — 22-26 août', color: 'indigo' },
  ];

  /* ─── PARTNERS ─── */
  partners = [
    { name: 'TechCorp', icon: 'building-2', sector: 'Technologie' },
    { name: 'MediPlus', icon: 'heart-pulse', sector: 'Santé' },
    { name: 'GreenEnergy', icon: 'zap', sector: 'Énergie' },
  ];

  /* ─── 4 FEATURES ─── */
  features: Feature[] = [
    {
      id: 'temps-presence',
      title: 'Temps & Présence',
      desc: 'Pointage géolocalisé, suivi en temps réel des entrées/sorties, détection automatique des anomalies et alertes proactives.',
      icon: 'map-pin',
      items: ['Géolocalisation automatique', 'Pointage mobile & NFC', 'Détection des anomalies en direct'],
    },
    {
      id: 'conges-teletravail',
      title: 'Congés & Télétravail',
      desc: 'Demandes unifiées, workflow de validation intelligent, soldes mis à jour automatiquement. Fini le papier et les mails.',
      icon: 'calendar',
      items: ['Demandes en un clic', 'Workflow validation personnalisable', 'Soldes & historiques temps réel'],
    },
    {
      id: 'organisation-rh',
      title: 'Organisation RH',
      desc: 'Structure organisationnelle, génération IA de documents RH, recrutement & scoring CV, signature électronique intégrée.',
      icon: 'building-2',
      items: ['Organigramme & équipes', 'Documents RH générés par IA', 'Recrutement & scoring CV'],
    },
    {
      id: 'ia-previsions',
      title: 'IA & Prévisions',
      desc: 'Assistant vocal multilingue, analyse prédictive des absences, recommandations automatiques pour anticiper les besoins.',
      icon: 'sparkles',
      items: ['Assistant vocal FR/EN/AR', 'Prévisions d\'absences IA', 'Recommandations automatiques'],
    },
  ];

  /* ─── TESTIMONIALS (2 grands) ─── */
  testimonials = [
    {
      name: 'Sophie Laurent',
      role: 'Directrice RH — Groupe TechCorp (450 employés)',
      text: 'WeenTime a transformé notre service RH en profondeur. Avant, la gestion des présences et des congés nous prenait des jours entiers par mois. Aujourd\'hui, tout est automatisé : le pointage, les validations, les documents, les alertes. Notre équipe RH a gagné 40% de productivité dès le premier mois. L\'assistant IA est un vrai game-changer — nos managers l\'utilisent quotidiennement sans aucune formation.',
      rating: 5,
      color: 'indigo',
    },
    {
      name: 'Marc Dubois',
      role: 'CEO — FinancePlus Groupe (200 employés)',
      text: 'Je cherchais une solution RH complète, moderne et sécurisée. WeenTime coche toutes les cases. Le déploiement a été ultra-rapide (moins d\'une journée), l\'interface est intuitive, et nos collaborateurs l\'ont adoptée sans résistance. Le retour sur investissement a été immédiat : gain de temps, réduction des erreurs, conformité RGPD assurée. Je recommande sans hésiter.',
      rating: 5,
      color: 'emerald',
    },
  ];

  /* ─── FAQ ─── */
  faqItems = [
    { question: 'WeenTime est-il conforme au RGPD ?', answer: 'Oui, WeenTime est entièrement conforme au RGPD. Les données sont hébergées en France, chiffrées de bout en bout, et chaque organisation dispose de son propre espace de données isolé (multi-tenant).' },
    { question: 'Combien de temps faut-il pour déployer WeenTime ?', answer: 'La configuration initiale prend moins de 30 minutes. L\'intégration complète avec vos outils (export, import, API) peut être réalisée en 1 à 2 jours ouvrés, avec accompagnement dédié.' },
    { question: 'Puis-je importer mes données RH existantes ?', answer: 'Absolument. WeenTime supporte l\'import CSV, Excel et API. Notre équipe vous accompagne dans la migration complète de vos données.' },
    { question: 'Quels sont les prérequis techniques ?', answer: 'Aucun. WeenTime est 100% SaaS, accessible depuis n\'importe quel navigateur récent et depuis nos applications mobiles iOS et Android.' },
    { question: 'Proposez-vous une période d\'essai ?', answer: 'Oui, nous proposons un essai gratuit de 30 jours, sans carte bancaire, avec toutes les fonctionnalités débloquées et un accompagnement personnalisé.' },
  ];
  openFaqIndex = signal<number | null>(null);
  toggleFaq(i: number) { this.openFaqIndex.set(this.openFaqIndex() === i ? null : i); }

  /* ─── FOOTER ─── */
  footerLinks = {
    produit: ['Pointage', 'Congés', 'Télétravail', 'Documents RH', 'Recrutement'],
    entreprise: ['À propos', 'Blog', 'Carrières', 'Contact', 'Médias'],
    ressources: ['Documentation', 'API', 'Statut', 'Changelog', 'Support'],
  };

  /* ─── AI CHAT ─── */
  chatMessages = signal<{ role: string; text: string; time: string }[]>([
    { role: 'assistant', text: 'Bonjour ! Je suis votre assistant WeenTime. Je peux vous aider à gérer vos présences, congés, documents RH et plus encore. Que puis-je faire pour vous ?', time: '9:32' }
  ]);
  chatInput = '';
  isAiTyping = signal(false);

  aiPrompts = [
    'Je veux poser un congé',
    'Soldes de Sarah K.',
    'Analyser les anomalies',
    'Générer une attestation',
  ];

  sendChatMessage() {
    const text = this.chatInput.trim();
    if (!text || this.isAiTyping()) return;
    const now = new Date();
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.chatMessages.update(msgs => [...msgs, { role: 'user', text, time }]);
    this.chatInput = '';
    this.isAiTyping.set(true);

    setTimeout(() => {
      this.isAiTyping.set(false);
      const t = new Date();
      const tStr = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
      const response = this.simulateResponse(text);
      this.chatMessages.update(msgs => [...msgs, { role: 'assistant', text: response, time: tStr }]);
    }, 1200);
  }

  sendAiPrompt(prompt: string) {
    this.chatInput = prompt;
    this.sendChatMessage();
  }

  private simulateResponse(query: string): string {
    const q = query.toLowerCase();
    if (q.includes('congé') || q.includes('poser')) {
      return 'Je lance l\'analyse...\n\n✓ Solde vérifié : 12 jours disponibles\n✓ Planning : aucune absence en conflit\n✓ Manager disponible pour validation\n✓ Demande pré-remplie\n\nSouhaitez-vous envoyer la demande de congé du 15 au 19 août ?';
    }
    if (q.includes('sarah') || q.includes('solde')) {
      return 'Voici le solde de Sarah K. :\n• Congés annuels : 12 jours restants\n• Maladie : 3 jours disponibles\n• Télétravail : 5 jours\n• Dernière demande : 15-19 août (validée ✓)';
    }
    if (q.includes('anomalie') || q.includes('analyse')) {
      return 'Analyse des anomalies cette semaine :\n• 2 retards non justifiés (équipe marketing)\n• 1 absence sans motif (logistique)\n• Tendance : +8% vs S-1\n\n📊 Rapport détaillé disponible.';
    }
    if (q.includes('attestation') || q.includes('document')) {
      return 'Quel type de document souhaitez-vous générer ?\n\n1. Attestation de travail\n2. Contrat de travail\n3. Avenant\n4. Certificat de présence\n\nIndiquez le numéro de votre choix.';
    }
    return 'J\'ai bien reçu votre demande. Je consulte les données... 👍 Tout est en ordre. Je finalise l\'action et vous tiens au courant.';
  }

  /* ─── UTILITY ─── */
  getInitial(name: string): string {
    return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  }

  /* ─── INTERSECTION OBSERVER ─── */
  ngAfterViewInit(): void {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -60px 0px' });

    this.el.nativeElement.querySelectorAll('.reveal').forEach((el: Element) => observer.observe(el));
  }
}
