// @vitest-environment jsdom

import '@angular/compiler';
import { readFile } from 'node:fs/promises';
import { ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import {
  ArrowRight,
  LucideAngularModule,
  MessageSquare,
  Mic,
  Move,
  SendHorizontal,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from 'lucide-angular';
import { Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { AssistantSyncService } from '../../core/services/assistant-sync.service';
import { ToastService } from '../../core/services/toast.service';
import { AssistantWorkflowService } from '../../core/services/assistant-workflow.service';
import { ChatWidgetComponent } from './chat-widget.component';
import { ChatService } from './chat.service';
import { VoiceAssistantEvent, VoiceAssistantService } from './voice-assistant.service';

class FakeAuthService {
  currentUser = () => null;
  getToken = () => null;
  hasRole = () => false;
}

class FakeChatService {
  getHistory = () => of({ success: true, items: [] });
  sendMessage = vi.fn();
  confirmAction = vi.fn();
  textToSpeech = vi.fn();
}

class FakeVoiceAssistantService {
  private readonly events = new Subject<VoiceAssistantEvent>();
  readonly events$ = this.events.asObservable();
  start = vi.fn(async () => undefined);
  stop = vi.fn(async () => undefined);

  emit(event: VoiceAssistantEvent): void {
    this.events.next(event);
  }
}

describe('ChatWidgetComponent', () => {
  let voiceAssistant: FakeVoiceAssistantService;
  let toast: { error: ReturnType<typeof vi.fn> };

  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(async () => {
    voiceAssistant = new FakeVoiceAssistantService();
    toast = {
      error: vi.fn(),
    };

    TestBed.resetTestingModule();
    await resolveComponentResources(url => readFile(new URL(url, import.meta.url), 'utf-8'));
    await TestBed.configureTestingModule({
      imports: [
        ChatWidgetComponent,
        LucideAngularModule.pick({
          ArrowRight,
          Sparkles,
          Mic,
          Move,
          X,
          MessageSquare,
          SendHorizontal,
          ShieldAlert,
          Trash2,
        }),
      ],
      providers: [
        { provide: ChatService, useClass: FakeChatService },
        { provide: VoiceAssistantService, useValue: voiceAssistant },
        { provide: AssistantWorkflowService, useValue: { consumeResponse: vi.fn() } },
        { provide: AuthService, useClass: FakeAuthService },
        { provide: NotificationService, useValue: { getNotifications: () => of([]) } },
        { provide: AssistantSyncService, useValue: { publish: vi.fn() } },
        { provide: ToastService, useValue: toast },
        {
          provide: Router,
          useValue: {
            navigateByUrl: vi.fn().mockResolvedValue(true),
            navigate: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compileComponents();
  });

  afterAll(() => {
    TestBed.resetTestEnvironment();
  });

  it('keeps the voice stop button as type=button', () => {
    const fixture = TestBed.createComponent(ChatWidgetComponent);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('.chat-panel__voice') as HTMLButtonElement | null;

    expect(button).toBeTruthy();
    expect(button?.type).toBe('button');
  });

  it('employee quick prompts include "My planning"', () => {
    const fixture = TestBed.createComponent(ChatWidgetComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.quickActions()).toContain('My planning');
  });

  it('isArabicText returns true for Arabic-script strings and false otherwise', () => {
    const fixture = TestBed.createComponent(ChatWidgetComponent);
    const component = fixture.componentInstance;

    expect(component.isArabicText('أريد عطلة')).toBe(true);
    expect(component.isArabicText('je veux conge')).toBe(false);
    expect(component.isArabicText('')).toBe(false);
    expect(component.isArabicText(null)).toBe(false);
  });

  it('messageDirection yields rtl for Arabic message text, ltr for Latin', () => {
    const fixture = TestBed.createComponent(ChatWidgetComponent);
    const component = fixture.componentInstance;

    const arabicMessage = {
      id: 'a', sender: 'assistant' as const, text: 'أريد إذن', timestamp: new Date(),
    };
    const frenchMessage = {
      id: 'b', sender: 'assistant' as const, text: 'Bonjour', timestamp: new Date(),
    };

    expect(component.messageDirection(arabicMessage)).toBe('rtl');
    expect(component.messageDirection(frenchMessage)).toBe('ltr');
  });

  it('shows an inline auth-expired state without raising the generic audio toast', () => {
    const fixture = TestBed.createComponent(ChatWidgetComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    voiceAssistant.emit({
      type: 'error',
      kind: 'authExpired',
      message: 'Votre session a expire. Veuillez vous reconnecter.',
    });
    fixture.detectChanges();

    expect(component.voiceState()).toBe('authExpired');
    expect(toast.error).not.toHaveBeenCalled();
    expect(component.messages().at(-1)).toMatchObject({
      text: 'Votre session a expire. Veuillez vous reconnecter.',
      actionLabel: 'Se reconnecter',
      actionTarget: '/login',
      actionKind: 'route',
      isError: true,
    });
  });
});
