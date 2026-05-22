export interface DocumentStatusChangedEvent {
  type: 'DOCUMENT_STATUS_CHANGED';
  documentId: number;
  newStatus: string;
  employeNom: string;
  message: string;
}
