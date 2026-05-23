export interface DocumentAuditEntry {
  id: number;
  action: string;
  actionLabel: string;
  details?: string;
  performedBy: number;
  performedByName: string;
  performedAt: string;
}
