import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { LucideAngularModule } from 'lucide-angular';
import { ChatApiResponse, ChatService } from '../../chat-widget/chat.service';

type ChatRole = 'user' | 'assistant' | 'error';

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  renderedContent: string;
  timestamp: Date;
  retryable: boolean;
  retryPayload?: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatComponent implements AfterViewInit {
  private readonly chatService = inject(ChatService);

  @ViewChild('scrollViewport') private scrollViewport?: ElementRef<HTMLDivElement>;
  @ViewChild('composerInput') private composerInput?: ElementRef<HTMLTextAreaElement>;

  readonly draft = signal('');
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly messages = signal<ChatMessage[]>([
    {
      id: this.createId(),
      role: 'assistant',
      content:
        "Bonjour. Je peux vous aider sur les conges, les autorisations, le teletravail, les documents et les notifications.",
      renderedContent: this.renderMarkdown(
        "Bonjour. Je peux vous aider sur les conges, les autorisations, le teletravail, les documents et les notifications."
      ),
      timestamp: new Date(),
      retryable: false,
    },
  ]);

  readonly canSend = computed(
    () => this.draft().trim().length > 0 && !this.isLoading()
  );
  private lastUserMessage = '';

  ngAfterViewInit(): void {
    this.scrollToBottom('auto');
    queueMicrotask(() => this.composerInput?.nativeElement.focus());
  }

  onDraftChange(value: string): void {
    this.draft.set(value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.sendMessage();
    }
  }

  sendMessage(retryPayload?: string, appendUserMessage = true): void {
    const message = (retryPayload ?? this.draft()).trim();
    if (!message || this.isLoading()) {
      return;
    }

    this.error.set(null);
    this.lastUserMessage = message;

    if (!retryPayload) {
      this.draft.set('');
    }

    if (appendUserMessage) {
      this.pushMessage({
        id: this.createId(),
        role: 'user',
        content: message,
        renderedContent: this.renderMarkdown(message),
        timestamp: new Date(),
        retryable: false,
      });
    }

    this.isLoading.set(true);
    this.scrollToBottom();

    this.chatService
      .sendMessage(message)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: response => {
          if (response?.status === 'error' || response?.success === false || !!response?.error) {
            const errorText = this.extractAssistantText(response);
            this.pushMessage({
              id: this.createId(),
              role: 'error',
              content: errorText,
              renderedContent: this.renderMarkdown(errorText),
              timestamp: new Date(),
              retryable: true,
              retryPayload: message,
            });
            return;
          }

          this.error.set(null);
          const assistantText = this.extractAssistantText(response);
          this.pushMessage({
            id: this.createId(),
            role: 'assistant',
            content: assistantText,
            renderedContent: this.renderMarkdown(assistantText),
            timestamp: new Date(),
            retryable: false,
          });
        },
        error: error => {
          const errorMessage = error?.message || "Le service AI est temporairement indisponible.";

          this.pushMessage({
            id: this.createId(),
            role: 'error',
            content: errorMessage,
            renderedContent: this.renderMarkdown(errorMessage),
            timestamp: new Date(),
            retryable: true,
            retryPayload: message,
          });
        },
      });
  }

  retry(action: string): void {
    void action;
    if (this.lastUserMessage) {
      this.sendMessage(this.lastUserMessage);
    }
  }

  retryMessage(message: ChatMessage): void {
    if (!message.retryPayload || this.isLoading()) {
      return;
    }

    this.messages.update(items => items.filter(item => item.id !== message.id));
    this.lastUserMessage = message.retryPayload;
    this.retry('CHAT');
  }

  trackByMessageId(_: number, message: ChatMessage): string {
    return message.id;
  }

  formatTimestamp(timestamp: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  }

  private pushMessage(message: ChatMessage): void {
    const items = this.messages();
    if (items.length > 0 && items[items.length - 1].content === message.content) {
      return;
    }
    this.messages.update(items => [...items, message]);
    this.scrollToBottom();
  }

  private scrollToBottom(behavior: ScrollBehavior = 'smooth'): void {
    setTimeout(() => {
      const viewport = this.scrollViewport?.nativeElement;
      if (!viewport) {
        return;
      }

      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior,
      });
    });
  }

  private extractAssistantText(response: ChatApiResponse | null | undefined): string {
    if (!response) {
      return "Le service AI n'a retourne aucune reponse.";
    }

    const directText =
      response.text ?? response.response ?? response.message ?? response.error;
    if (typeof directText === 'string' && directText.trim()) {
      return directText.trim();
    }

    if (response.data != null) {
      return typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data, null, 2);
    }

    return "Le service AI n'a retourne aucune reponse.";
  }

  private renderMarkdown(markdown: string): string {
    const codeBlocks: string[] = [];
    const markdownWithPlaceholders = markdown.replace(
      /```([\w-]+)?\n([\s\S]*?)```/g,
      (_match, language, code) => {
        const index = codeBlocks.push(
          `<div class="md-code-block"><div class="md-code-header">${this.escapeHtml(
            language || 'code'
          )}</div><pre><code>${this.escapeHtml(code.trim())}</code></pre></div>`
        );
        return `%%CODE_BLOCK_${index - 1}%%`;
      }
    );
    let html = this.escapeHtml(markdownWithPlaceholders);

    html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    html = this.renderLists(html);
    html = html
      .split(/\n{2,}/)
      .map(block => {
        if (
          block.includes('<ul>') ||
          block.includes('%%CODE_BLOCK_') ||
          /^<h[1-3]>/.test(block)
        ) {
          return block;
        }

        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
      })
      .join('');

    codeBlocks.forEach((block, index) => {
      html = html.replace(`%%CODE_BLOCK_${index}%%`, block);
    });

    return html;
  }

  private renderLists(html: string): string {
    return html.replace(/(?:^|\n)((?:- .*(?:\n|$))+)/g, (_match, listBlock) => {
      const items = listBlock
        .trim()
        .split('\n')
        .map((line: string) => line.replace(/^- /, '').trim())
        .filter(Boolean)
        .map((line: string) => `<li>${line}</li>`)
        .join('');

      return `<ul>${items}</ul>`;
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private createId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private detectAction(message: string): string {
    const normalized = (message || '').toLowerCase();
    if (
      normalized.includes('conge')
      || normalized.includes('congé')
      || normalized.includes('leave')
      || normalized.includes('vacation')
    ) {
      return 'CREATE_LEAVE';
    }
    if (normalized.includes('pointer') || normalized.includes('clock')) {
      return 'CLOCK_IN';
    }
    if (normalized.includes('paie')) {
      return 'DOCUMENT_REQUEST';
    }
    return 'CHAT';
  }
}
