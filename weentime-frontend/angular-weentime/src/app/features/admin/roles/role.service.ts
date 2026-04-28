import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Role, RoleRequest } from './role.model';

@Injectable({
  providedIn: 'root'
})
export class RoleService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/organisations/roles`;

  getAllRoles(): Observable<Role[]> {
    return this.http.get<Role[]>(this.apiUrl);
  }

  getRoleById(id: number): Observable<Role> {
    return this.http.get<Role>(`${this.apiUrl}/${id}`);
  }

  createRole(request: RoleRequest): Observable<Role> {
    return this.http.post<Role>(this.apiUrl, request);
  }

  updateRole(id: number, request: RoleRequest): Observable<Role> {
    return this.http.put<Role>(`${this.apiUrl}/${id}`, request);
  }

  deleteRole(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
