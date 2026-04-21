import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import {
  AssistantActionResult,
  AssistantFormFill,
  AssistantResponseMeta,
} from '../models/assistant.model';

export interface AssistantSyncEvent {
  timestamp: number;
  intent?: string;
  entities?: Record<string, unknown>;
  actionResult?: AssistantActionResult | null;
  formFill?: AssistantFormFill | null;
  channel: 'chat' | 'voice';
}

@Injectable({ providedIn: 'root' })
export class AssistantSyncService {
  private readonly eventsSubject = new Subject<AssistantSyncEvent>();

  readonly events$ = this.eventsSubject.asObservable();
  readonly lastEvent = signal<AssistantSyncEvent | null>(null);

  publish(meta: AssistantResponseMeta, channel: 'chat' | 'voice'): void {
    if (!meta.action_result && !meta.form_fill) {
      return;
    }

    const event: AssistantSyncEvent = {
      timestamp: Date.now(),
      intent: typeof meta.intent === 'string' ? meta.intent : undefined,
      entities: meta.entities,
      actionResult: meta.action_result ?? null,
      formFill: meta.form_fill ?? null,
      channel,
    };

    this.lastEvent.set(event);
    this.eventsSubject.next(event);
  }
}
