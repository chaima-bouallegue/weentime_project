import { Component, Input, OnInit, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';
import { AiSuggestionService, AiSuggestion } from '../../../core/services/ai-suggestion.service';
import { DemandeTeletravailWorkflow } from '../../../features/shared/models/workflow-teletravail.model';

@Component({
  selector: 'app-ai-suggestion-badge',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border shadow-sm transition-all" 
         [ngClass]="getBadgeClasses()"
         [title]="suggestion()?.reasoning || 'Analyse IA en cours...'">
      <lucide-icon [name]="getIconName()" [size]="14" [class.animate-pulse]="isLoading()"></lucide-icon>
      @if (isLoading()) {
        <span>Analyse IA...</span>
      } @else if (suggestion()) {
        <span>IA: {{ getLabel() }} ({{ suggestion()?.confidenceScore }}%)</span>
      }
    </div>
  `
})
export class AiSuggestionBadgeComponent implements OnInit {
  @Input({ required: true }) demande!: DemandeTeletravailWorkflow;
  
  private aiService = inject(AiSuggestionService);
  
  isLoading = signal(true);
  suggestion = signal<AiSuggestion | null>(null);

  ngOnInit(): void {
    if (this.demande) {
      this.aiService.analyzeRequest(this.demande).subscribe((res: AiSuggestion) => {
        this.suggestion.set(res);
        this.isLoading.set(false);
      });
    }
  }

  getBadgeClasses(): string {
    if (this.isLoading()) return 'bg-indigo-50 text-indigo-700 border-indigo-200 opacity-70';
    const rec = this.suggestion()?.recommendation;
    if (rec === 'APPROVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-emerald-100/50';
    if (rec === 'REJECT') return 'bg-rose-50 text-rose-700 border-rose-200 shadow-rose-100/50';
    return 'bg-amber-50 text-amber-700 border-amber-200 shadow-amber-100/50';
  }

  getIconName(): string {
    if (this.isLoading()) return 'sparkles';
    const rec = this.suggestion()?.recommendation;
    if (rec === 'APPROVE') return 'check-circle-2';
    if (rec === 'REJECT') return 'x-circle';
    return 'alert-circle';
  }

  getLabel(): string {
    const rec = this.suggestion()?.recommendation;
    if (rec === 'APPROVE') return 'Valider';
    if (rec === 'REJECT') return 'Refuser';
    return 'Manuel';
  }
}
