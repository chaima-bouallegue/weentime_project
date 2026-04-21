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
    return (solde.pris / solde.total) * 100;
  }
}
