import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable, OperatorFunction } from 'rxjs';
import { ApiConfigService } from '@app/core/services/api-config.service';
import {
  ApiEnvelope,
  ChannelModel,
  CommunicationBootstrapResponse,
  CreateChannelRequest,
  CursorMessagePageResponse,
  EventReplayResponse,
  MarkChannelReadRequest,
  MessageModel,
  OpenDirectRequest,
  ProvisioningSyncResponse,
  ReadMarkerResponse,
  SendMessageRequest,
  UpdateMessageRequest,
  UnreadSummaryModel,
  AttachmentModel
} from '../models/communication.models';

@Injectable({
  providedIn: 'root'
})
export class CommunicationApiService {
  private readonly http = inject(HttpClient);
  private readonly apiConfig = inject(ApiConfigService);

  getChannels(): Observable<ChannelModel[]> {
    const url = this.apiConfig.buildUrl('/communication/channels');
    return this.http.get<ApiEnvelope<ChannelModel[]>>(url).pipe(this.unwrapResponse('GET', url));
  }

  getChannel(channelId: string): Observable<ChannelModel> {
    const url = this.apiConfig.buildUrl(`/communication/channels/${channelId}`);
    return this.http.get<ApiEnvelope<ChannelModel>>(url).pipe(this.unwrapResponse('GET', url));
  }

  createChannel(request: CreateChannelRequest): Observable<ChannelModel> {
    const url = this.apiConfig.buildUrl('/communication/channels');
    return this.http.post<ApiEnvelope<ChannelModel>>(url, request).pipe(this.unwrapResponse('POST', url));
  }

  openDirectMessage(userId: number): Observable<ChannelModel> {
    const payload: OpenDirectRequest = { userId };
    const url = this.apiConfig.buildUrl('/communication/direct');
    return this.http.post<ApiEnvelope<ChannelModel>>(url, payload).pipe(this.unwrapResponse('POST', url));
  }

  getMessages(channelId: string, limit: number = 30, before?: string | null): Observable<CursorMessagePageResponse> {
    const url = this.apiConfig.buildUrl(`/communication/channels/${channelId}/messages`);
    let params = new HttpParams().set('limit', String(limit));
    if (before) {
      params = params.set('before', before);
    }
    return this.http.get<ApiEnvelope<CursorMessagePageResponse>>(url, { params }).pipe(this.unwrapResponse('GET', url));
  }

  getThreadReplies(rootMessageId: string, limit: number = 50): Observable<CursorMessagePageResponse> {
    const url = this.apiConfig.buildUrl(`/communication/messages/${rootMessageId}/replies`);
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<ApiEnvelope<CursorMessagePageResponse>>(url, { params }).pipe(this.unwrapResponse('GET', url));
  }

  sendMessage(channelId: string, request: SendMessageRequest): Observable<MessageModel> {
    const url = this.apiConfig.buildUrl(`/communication/channels/${channelId}/messages`);
    return this.http.post<ApiEnvelope<MessageModel>>(url, request).pipe(this.unwrapResponse('POST', url));
  }

  updateMessage(messageId: string, request: UpdateMessageRequest): Observable<MessageModel> {
    const url = this.apiConfig.buildUrl(`/communication/messages/${messageId}`);
    return this.http.put<ApiEnvelope<MessageModel>>(url, request).pipe(this.unwrapResponse('PUT', url));
  }

  deleteMessage(messageId: string): Observable<MessageModel> {
    const url = this.apiConfig.buildUrl(`/communication/messages/${messageId}`);
    return this.http.delete<ApiEnvelope<MessageModel>>(url).pipe(this.unwrapResponse('DELETE', url));
  }

  addReaction(messageId: string, emoji: string): Observable<MessageModel> {
    const url = this.apiConfig.buildUrl(`/communication/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    return this.http.put<ApiEnvelope<MessageModel>>(url, {}).pipe(this.unwrapResponse('PUT', url));
  }

  removeReaction(messageId: string, emoji: string): Observable<MessageModel> {
    const url = this.apiConfig.buildUrl(`/communication/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`);
    return this.http.delete<ApiEnvelope<MessageModel>>(url).pipe(this.unwrapResponse('DELETE', url));
  }

  markRead(messageId: string): Observable<ReadMarkerResponse> {
    const url = this.apiConfig.buildUrl(`/communication/messages/${messageId}/read`);
    return this.http.post<ApiEnvelope<ReadMarkerResponse>>(url, {}).pipe(this.unwrapResponse('POST', url));
  }

  markChannelRead(channelId: string, messageId?: string | null): Observable<ReadMarkerResponse> {
    const url = this.apiConfig.buildUrl(`/communication/channels/${channelId}/read`);
    const payload: MarkChannelReadRequest = messageId ? { messageId } : {};
    return this.http.post<ApiEnvelope<ReadMarkerResponse>>(url, payload).pipe(this.unwrapResponse('POST', url));
  }

  uploadAttachments(files: File[]): Observable<AttachmentModel[]> {
    const url = this.apiConfig.buildUrl('/communication/attachments');
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    return this.http.post<ApiEnvelope<AttachmentModel[]>>(url, formData).pipe(this.unwrapResponse('POST', url));
  }

  getDownloadUrl(attachmentId: string): string {
    return this.apiConfig.buildUrl(`/communication/attachments/${attachmentId}/download`);
  }

  getUnreadSummary(): Observable<UnreadSummaryModel> {
    const url = this.apiConfig.buildUrl('/communication/unread-summary');
    return this.http.get<ApiEnvelope<UnreadSummaryModel>>(url).pipe(this.unwrapResponse('GET', url));
  }

  replayEvents(afterEventId: string, limit: number = 100): Observable<EventReplayResponse> {
    const url = this.apiConfig.buildUrl('/communication/events/replay');
    const params = new HttpParams()
      .set('afterEventId', afterEventId)
      .set('limit', String(limit));
    return this.http.get<ApiEnvelope<EventReplayResponse>>(url, { params }).pipe(this.unwrapResponse('GET', url));
  }

  bootstrapCommunication(): Observable<CommunicationBootstrapResponse> {
    const url = this.apiConfig.buildUrl('/communication/admin/bootstrap');
    return this.http.post<ApiEnvelope<CommunicationBootstrapResponse>>(url, {}).pipe(this.unwrapResponse('POST', url));
  }

  syncCommunication(entrepriseId?: number): Observable<ProvisioningSyncResponse> {
    const endpoint = Number.isFinite(entrepriseId)
      ? `/communication/admin/sync/enterprise/${entrepriseId}`
      : '/communication/admin/sync';
    const url = this.apiConfig.buildUrl(endpoint);
    return this.http.post<ApiEnvelope<ProvisioningSyncResponse>>(url, {}).pipe(this.unwrapResponse('POST', url));
  }

  private unwrapResponse<T>(method: string, url: string): OperatorFunction<ApiEnvelope<T>, T> {
    void method;
    void url;
    return source => source.pipe(map(response => this.unwrap(response)));
  }

  private unwrap<T>(response: ApiEnvelope<T>): T {
    if (response?.success === false || response?.error) {
      throw new Error(response.error?.message ?? 'Communication request failed.');
    }
    return response.data;
  }
}
