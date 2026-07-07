import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { SoldeConge, TypeConge } from '../../models/conge.model';

@Component({
  selector: 'app-solde-cards',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './solde-cards.component.html',
  styleUrl: './solde-cards.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SoldeCardsComponent {
  @Input() soldes: SoldeConge[] = [];
  @Input() isLoading = false;
  @Output() filterByType = new EventEmitter<TypeConge | 'TOUS'>();

  calculatePercentage(solde: SoldeConge): number {
    if (solde.total === 0) return 0;
    return Math.min((solde.pris / solde.total) * 100, 100);
  }

  /** Returns a Lucide icon name based on the leave type label */
  getIcon(solde: SoldeConge): string {
    const label = (solde.label ?? solde.type ?? '').toLowerCase();
    if (label.includes('annuel'))     return 'Umbrella';
    if (label.includes('maladie'))    return 'Heart';
    if (label.includes('rtt'))        return 'Clock';
    if (label.includes('matern') || label.includes('patern')) return 'Baby';
    if (label.includes('exception'))  return 'Star';
    if (label.includes('sans'))       return 'MinusCircle';
    return 'Calendar';
  }


  /** Returns a subtle background color for the chip icon */
  chipBg(solde: SoldeConge): string {
    const c = solde.couleur ?? '#6366f1';
    return c + '1a'; // ~10% opacity hex
  }

  emitVoirTout(): void {
    this.filterByType.emit('TOUS');
  }
}
