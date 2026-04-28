import type { TypeConge } from './conge.model';

export type { TypeConge };

export interface LeaveTypeUI {
  type: TypeConge;
  label: string;
  description: string;
  icon: string;
  color: string;
  colorHex: string;
  remainingDays: number;
  isAvailable: boolean;
  isUnpaid: boolean;
  availabilityMessage?: string;
  [key: string]: unknown;
}
