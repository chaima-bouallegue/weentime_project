import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { 
  Reunion, 
  ReunionCreateRequest, 
  ReunionStatut, 
  RSVPResponse, 
  ConflictResponse 
} from '../models/reunion.model';

@Injectable({
  providedIn: 'root'
})
export class ReunionService {
  private apiUrl = `${environment.apiUrl}/rh/reunions`;

  constructor(private http: HttpClient) {}

  create(request: ReunionCreateRequest): Observable<Reunion> {
    return this.http.post<Reunion>(this.apiUrl, request);
  }

  getMesReunions(): Observable<Reunion[]> {
    return this.http.get<Reunion[]>(`${this.apiUrl}/mes-reunions`);
  }

  getProchaine(): Observable<Reunion> {
    return this.http.get<Reunion>(`${this.apiUrl}/prochaine`);
  }

  getDetail(uuid: string): Observable<Reunion> {
    return this.http.get<Reunion>(`${this.apiUrl}/${uuid}`);
  }

  repondre(uuid: string, reponse: RSVPResponse, rappelMinutes?: number): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${uuid}/repondre`, { reponse, rappelMinutes });
  }

  cloturer(uuid: string, participantsPresents: number[], compteRendu: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${uuid}/cloturer`, { participantsPresents, compteRendu });
  }

  update(uuid: string, data: Partial<Reunion>): Observable<Reunion> {
    return this.http.patch<Reunion>(`${this.apiUrl}/${uuid}`, data);
  }

  annuler(uuid: string): Observable<void> {
    return this.http.patch<void>(`${this.apiUrl}/${uuid}/annuler`, {});
  }

  checkConflicts(date: string, heureDebut: string, heureFin: string, userIds: number[]): Observable<ConflictResponse> {
    const params = new HttpParams()
      .set('date', date)
      .set('heureDebut', heureDebut)
      .set('heureFin', heureFin)
      .set('userIds', userIds.join(','));
    
    return this.http.get<ConflictResponse>(`${this.apiUrl}/conflits`, { params });
  }
}
