import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, FileText, ArrowRight, Loader2, Sparkles, Shield, Briefcase, FileSignature, Wallet, GraduationCap, HeartPulse } from 'lucide-angular';
import { TypeDocumentConfig, TypeDocument } from '../../models/document.model';

@Component({
  selector: 'app-document-type-grid',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './document-type-grid.component.html',
  styleUrl: './document-type-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None
})
export class DocumentTypeGridComponent {
  @Input() types: TypeDocumentConfig[] = [];
  @Input() isLoading = false;

  @Output() demander = new EventEmitter<TypeDocument>();

  // Icons
  readonly iconFile = FileText;
  readonly iconArrow = ArrowRight;
  readonly iconLoader = Loader2;

  readonly icons: Record<string, any> = {
    'attestation_salaire': Wallet,
    'attestation_travail': Briefcase,
    'fiche_paie': FileSignature,
    'titre_conge': Sparkles,
    'domiciliation_salaire': Shield,
    'bordereau_cnss': HeartPulse,
    'attestation_formation': GraduationCap,
    'default': FileText
  };

  getIcon(code: string): any {
    return this.icons[code.toLowerCase()] || this.icons['default'];
  }

  skeletonItems = Array(7).fill(0);

  onDemander(type: TypeDocument, event: Event): void {
    event.stopPropagation();
    this.demander.emit(type);
  }

  onCardClick(type: TypeDocument): void {
    this.demander.emit(type);
  }
}
