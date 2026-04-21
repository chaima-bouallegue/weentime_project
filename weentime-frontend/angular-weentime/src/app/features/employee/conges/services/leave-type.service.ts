import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { ApiConfigService } from '@app/core/services/api-config.service';
import { LeaveTypeUI, TypeConge } from '../models/leave-type.model';

interface SoldeCongeApi {
  typeCongeId?: number;
  joursRestants?: number;
}

@Injectable({
  providedIn: 'root'
})
export class LeaveTypeService {
  private httpClient = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);

  getLeaveTypes(): Observable<LeaveTypeUI[]> {
    const year = new Date().getFullYear();

    return this.httpClient
      .get<any>(this.apiConfig.RH.GET_LEAVE_BALANCE(year))
      .pipe(
        map(response => {
          const data = response?.data || response;
          const items = Array.isArray(data) ? data : [];
          return this.mapSoldesToLeaveTypes(items);
        }),
        catchError(error => {
          const message = error?.error?.details || error?.error?.message || 'Erreur lors du chargement des types de conges';
          return throwError(() => new Error(message));
        })
      );
  }

  private mapSoldesToLeaveTypes(items: SoldeCongeApi[]): LeaveTypeUI[] {
    const soldes = new Map<TypeConge, number>([
      ['ANNUEL', 0],
      ['MALADIE', 0],
      ['RTT', 0],
      ['MATERNITE_PATERNITE', 0],
      ['EXCEPTIONNEL', 0],
    ]);

    for (const item of items) {
      soldes.set(this.idToType(item.typeCongeId), Number(item.joursRestants ?? 0));
    }

    return [
      this.toLeaveType('ANNUEL', 'Conge annuel', 'Conges payes annuels', 'umbrella', 'indigo', '#6366f1', soldes.get('ANNUEL') ?? 0),
      this.toLeaveType('MALADIE', 'Conge maladie', 'Arret maladie', 'heart', 'red', '#ef4444', soldes.get('MALADIE') ?? 0),
      this.toLeaveType('RTT', 'RTT', 'Reduction du Temps de Travail', 'clock', 'cyan', '#06b6d4', soldes.get('RTT') ?? 0),
      this.toLeaveType('MATERNITE_PATERNITE', 'Maternite/Paternite', 'Conge de maternite ou de paternite', 'baby', 'pink', '#ec4899', soldes.get('MATERNITE_PATERNITE') ?? 0),
      this.toLeaveType('EXCEPTIONNEL', 'Conge exceptionnel', 'Evenement familial ou exceptionnel', 'star', 'amber', '#f59e0b', soldes.get('EXCEPTIONNEL') ?? 0),
      {
        type: 'SANS_SOLDE',
        label: 'Sans solde',
        description: 'Conge sans solde - Aucun quota requis',
        icon: 'minus-circle',
        color: 'slate',
        colorHex: '#94a3b8',
        remainingDays: Infinity,
        isAvailable: true,
        isUnpaid: true,
        availabilityMessage: 'Aucun quota requis'
      }
    ];
  }

  private toLeaveType(
    type: TypeConge,
    label: string,
    description: string,
    icon: string,
    color: string,
    colorHex: string,
    remainingDays: number
  ): LeaveTypeUI {
    return {
      type,
      label,
      description,
      icon,
      color,
      colorHex,
      remainingDays,
      isAvailable: remainingDays > 0,
      isUnpaid: false,
      availabilityMessage: this.getAvailabilityMessage(remainingDays)
    };
  }

  private getAvailabilityMessage(remainingDays: number): string {
    if (remainingDays <= 0) {
      return 'Aucun jour disponible';
    }
    if (remainingDays === 1) {
      return 'Il vous reste 1 jour';
    }
    return `Il vous reste ${remainingDays} jours`;
  }

  private idToType(id?: number): TypeConge {
    const mapping: Record<number, TypeConge> = {
      1: 'ANNUEL',
      2: 'MALADIE',
      3: 'RTT',
      4: 'MATERNITE_PATERNITE',
      5: 'EXCEPTIONNEL',
      6: 'SANS_SOLDE',
    };

    return id ? mapping[id] || 'EXCEPTIONNEL' : 'EXCEPTIONNEL';
  }

  canSelectLeaveType(type: TypeConge, leaveTypes: LeaveTypeUI[]): boolean {
    const leaveType = leaveTypes.find(lt => lt.type === type);
    return leaveType ? leaveType.isAvailable : false;
  }

  getLeaveType(type: TypeConge, leaveTypes: LeaveTypeUI[]): LeaveTypeUI | undefined {
    return leaveTypes.find(lt => lt.type === type);
  }
}
