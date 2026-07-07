import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  AssistantAuthorizationDraft,
  AssistantDocumentDraft,
  AssistantFormFill,
  AssistantLeaveDraft,
  AssistantResponseMeta,
  AssistantTeleworkDraft,
  AssistantWorkflowState,
} from '../models/assistant.model';

@Injectable({ providedIn: 'root' })
export class AssistantWorkflowService {
  private readonly router = inject(Router);

  readonly leaveDraft = signal<AssistantLeaveDraft | null>(null);
  readonly authorizationDraft = signal<AssistantAuthorizationDraft | null>(null);
  readonly teleworkDraft = signal<AssistantTeleworkDraft | null>(null);
  readonly documentDraft = signal<AssistantDocumentDraft | null>(null);
  readonly workflowState = signal<AssistantWorkflowState | null>(null);

  consumeResponse(meta: AssistantResponseMeta): void {
    this.workflowState.set(meta.workflow ?? null);

    const formFill = meta.form_fill;
    if (!formFill) return;

    switch (meta.intent) {
      case 'CREATE_LEAVE':
        this.leaveDraft.set(this.toLeaveDraft(formFill, meta));
        break;
      case 'CREATE_TELEWORK':
        this.teleworkDraft.set(this.toTeleworkDraft(formFill, meta));
        break;
      case 'CREATE_AUTORISATION':
        this.authorizationDraft.set(this.toAuthorizationDraft(formFill, meta));
        break;
      case 'REQUEST_DOCUMENT':
        this.documentDraft.set(this.toDocumentDraft(formFill, meta));
        break;
    }

    this.navigateIfNeeded(formFill);
  }

  clearLeaveDraft(id?: string): void {
    if (!id || this.leaveDraft()?.id === id) {
      this.leaveDraft.set(null);
    }
  }

  clearAuthorizationDraft(id?: string): void {
    if (!id || this.authorizationDraft()?.id === id) {
      this.authorizationDraft.set(null);
    }
  }

  clearTeleworkDraft(id?: string): void {
    if (!id || this.teleworkDraft()?.id === id) {
      this.teleworkDraft.set(null);
    }
  }

  clearDocumentDraft(id?: string): void {
    if (!id || this.documentDraft()?.id === id) {
      this.documentDraft.set(null);
    }
  }

  private navigateIfNeeded(formFill: AssistantFormFill): void {
    if (formFill.auto_open && formFill.route) {
      void this.router.navigateByUrl(formFill.route);
    }
  }

  private toLeaveDraft(
    formFill: AssistantFormFill,
    meta: AssistantResponseMeta
  ): AssistantLeaveDraft {
    const fields = formFill.fields;
    return {
      id: this.createDraftId(),
      mode: formFill.mode,
      autoOpen: formFill.auto_open,
      route: formFill.route,
      dateDebut: this.readString(fields['dateDebut']),
      dateFin: this.readString(fields['dateFin']),
      typeLabel: this.readString(fields['typeLabel']),
      typeCongeId: this.readNumber(fields['typeCongeId']),
      motif: this.readString(fields['motif']),
      actionResult: meta.action_result ?? null,
    };
  }

  private toAuthorizationDraft(
    formFill: AssistantFormFill,
    meta: AssistantResponseMeta
  ): AssistantAuthorizationDraft {
    const fields = formFill.fields;
    return {
      id: this.createDraftId(),
      mode: formFill.mode,
      autoOpen: formFill.auto_open,
      route: formFill.route,
      date: this.readString(fields['date']),
      heureDebut: this.readString(fields['heureDebut']),
      heureFin: this.readString(fields['heureFin']),
      type: this.readString(fields['type']),
      motif: this.readString(fields['motif']),
      actionResult: meta.action_result ?? null,
    };
  }

  private toTeleworkDraft(
    formFill: AssistantFormFill,
    meta: AssistantResponseMeta
  ): AssistantTeleworkDraft {
    const fields = formFill.fields;
    return {
      id: this.createDraftId(),
      mode: formFill.mode,
      autoOpen: formFill.auto_open,
      route: formFill.route,
      dateDebut: this.readString(fields['dateDebut']),
      dateFin: this.readString(fields['dateFin']),
      type: this.readString(fields['type']),
      motif: this.readString(fields['motif']),
      actionResult: meta.action_result ?? null,
    };
  }

  private toDocumentDraft(
    formFill: AssistantFormFill,
    meta: AssistantResponseMeta
  ): AssistantDocumentDraft {
    const fields = formFill.fields;
    return {
      id: this.createDraftId(),
      mode: formFill.mode,
      autoOpen: formFill.auto_open,
      route: formFill.route,
      type: this.readString(fields['type']),
      motif: this.readString(fields['motif']),
      moisConcerne: this.readString(fields['moisConcerne']),
      actionResult: meta.action_result ?? null,
    };
  }

  private createDraftId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }
}
