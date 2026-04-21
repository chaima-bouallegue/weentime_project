import { Component, Input, Output, EventEmitter, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { take } from 'rxjs';
import { ToastService } from '../../../../../core/services/toast.service';
import { DemandeDocumentRH } from '../../models/rh-document.model';
import { RhDocumentService } from '../../rh-document.service';

@Component({
  selector: 'app-ai-generation-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './ai-generation-modal.component.html',
  styleUrl: './ai-generation-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AiGenerationModalComponent {
  private documentService = inject(RhDocumentService);
  private toastService = inject(ToastService);

  @Input({ required: true }) demande: DemandeDocumentRH | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() validate = new EventEmitter<{ id: number, content: string }>();

  generatedContent = signal<string>('');
  isGenerating = signal<boolean>(false);
  streamingContent = signal<string>('');

  // Progress indicators
  progressText = signal<string>('Preparation du prompt...');

  generate() {
    if (!this.demande) return;

    this.isGenerating.set(true);
    this.generatedContent.set('');
    this.streamingContent.set('');
    this.progressText.set("Appel a l'IA Anthropic...");

    this.documentService.generateAIDocument(this.demande)
      .pipe(take(1))
      .subscribe({
        next: result => {
          this.generatedContent.set(result.contenu);
          this.startStreaming(result.contenu);
        },
        error: () => {
          this.isGenerating.set(false);
          this.progressText.set('Erreur lors de la generation.');
          this.toastService.error("La generation du document a echoue.");
        }
      });
  }

  private startStreaming(fullText: string) {
    this.isGenerating.set(true);
    this.progressText.set('Generation en cours...');

    let index = 0;

    const interval = setInterval(() => {
      if (index < fullText.length) {
        this.streamingContent.update(curr => curr + fullText[index]);
        index++;
      } else {
        clearInterval(interval);
        this.isGenerating.set(false);
        this.progressText.set('Generation terminee.');
      }
    }, 15);
  }

  onValidate() {
    if (this.demande && this.streamingContent()) {
      this.validate.emit({ id: this.demande.id, content: this.streamingContent() });
    }
  }

  getInitials(nom: string, prenom: string): string {
    return (prenom[0] + nom[0]).toUpperCase();
  }
}
