import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Centralized API configuration for the WeenTime application.
 * All API endpoints are defined here for easy maintenance and consistency.
 * 
 * API Gateway: http://localhost:8222/api/v1/
 * 
 * Services routed through gateway:
 * - auth-service (8081)
 * - organisation-service (8090)
 * - rh-service (8092)
 * - presence-service (8093)
 */
@Injectable({
  providedIn: 'root'
})
export class ApiConfigService {
  private readonly API_BASE = `${environment.apiUrl}/api/v1`;

  // Public getter for API base URL (used by services that need dynamic URL construction)
  getApiBase(): string {
    return this.API_BASE;
  }

  // ─────────────────────────────────────────────
  // AUTH ENDPOINTS
  // ─────────────────────────────────────────────
  readonly AUTH = {
    LOGIN: `${this.API_BASE}/auth/login`,
    REGISTER: `${this.API_BASE}/auth/register`,
    VERIFY_2FA: `${this.API_BASE}/auth/verify-2fa`,
    VALIDATE_TOKEN: `${this.API_BASE}/auth/validate`,
    SETUP_2FA: `${this.API_BASE}/auth/2fa/setup`,
    CONFIRM_2FA: `${this.API_BASE}/auth/2fa/confirm`,
    DISABLE_2FA: `${this.API_BASE}/auth/2fa/disable`
  };

  // ─────────────────────────────────────────────
  // USER PROFILE ENDPOINTS (Organisation Service)
  // ─────────────────────────────────────────────
  readonly USER = {
    GET_PROFILE: `${this.API_BASE}/users/me`,
    UPDATE_PROFILE: `${this.API_BASE}/users/me`,
    GET_ACTIVITY: `${this.API_BASE}/users/me/activity`,
    CHANGE_PASSWORD: `${this.API_BASE}/users/me/password`,
    UPLOAD_AVATAR: `${this.API_BASE}/users/me/avatar`
  };

  // ─────────────────────────────────────────────
  // ORGANISATION ENDPOINTS
  // ─────────────────────────────────────────────
  readonly ORGANISATION = {
    // Departments
    GET_DEPARTEMENTS: `${this.API_BASE}/organisations/departements`,
    CREATE_DEPARTEMENT: `${this.API_BASE}/organisations/departements`,
    UPDATE_DEPARTEMENT: (id: number) => `${this.API_BASE}/organisations/departements/${id}`,
    DELETE_DEPARTEMENT: (id: number) => `${this.API_BASE}/organisations/departements/${id}`,

    // Teams
    GET_EQUIPES: `${this.API_BASE}/organisations/equipes`,
    CREATE_EQUIPE: `${this.API_BASE}/organisations/equipes`,
    UPDATE_EQUIPE: (id: number) => `${this.API_BASE}/organisations/equipes/${id}`,
    DELETE_EQUIPE: (id: number) => `${this.API_BASE}/organisations/equipes/${id}`,
    GET_EQUIPE_MEMBERS: (id: number) => `${this.API_BASE}/organisations/equipes/${id}/members`,

    // Users (Employees)
    GET_USERS: `${this.API_BASE}/organisations/users`,
    GET_USER_BY_ID: (id: number) => `${this.API_BASE}/organisations/users/${id}`,
    GET_USER_BY_EMAIL: (email: string) => `${this.API_BASE}/organisations/users/email/${email}`,
    CREATE_USER: `${this.API_BASE}/organisations/users`,
    UPDATE_USER: (id: number) => `${this.API_BASE}/organisations/users/${id}`,
    DELETE_USER: (id: number) => `${this.API_BASE}/organisations/users/${id}`,
    TOGGLE_USER_STATUS: (id: number) => `${this.API_BASE}/organisations/users/${id}/toggle-status`,

    // Companies
    GET_ENTREPRISES: `${this.API_BASE}/organisations/entreprises`,
    GET_ENTREPRISE_BY_ID: (id: number) => `${this.API_BASE}/organisations/entreprises/${id}`,
    CREATE_ENTREPRISE: `${this.API_BASE}/organisations/entreprises`,
    UPDATE_ENTREPRISE: (id: number) => `${this.API_BASE}/organisations/entreprises/${id}`,
    VALIDATE_COMPANY_CODE: (code: string) => `${this.API_BASE}/organisations/entreprises/validate-code/${code}`,

    // RH Users
    GET_RH_USERS: `${this.API_BASE}/organisations/rh`,
    GET_RH_BY_COMPANY: (id: number) => `${this.API_BASE}/organisations/rh/entreprise/${id}`,
    TOGGLE_RH_STATUS: (id: number) => `${this.API_BASE}/organisations/rh/${id}/toggle-status`,

    // Roles
    GET_ROLES: `${this.API_BASE}/organisations/roles`,
    CREATE_ROLE: `${this.API_BASE}/organisations/roles`,
    UPDATE_ROLE: (id: number) => `${this.API_BASE}/organisations/roles/${id}`,
    DELETE_ROLE: (id: number) => `${this.API_BASE}/organisations/roles/${id}`
  };

  readonly STRUCTURE = {
    GET_DEPARTMENTS: `${this.API_BASE}/structure/departments`,
    GET_TEAMS: `${this.API_BASE}/structure/teams`,
    GET_MANAGERS: `${this.API_BASE}/structure/managers`,
    GET_EMPLOYEES: `${this.API_BASE}/structure/employees`
  };

  // ─────────────────────────────────────────────
  // RH (LEAVE/ABSENCE) ENDPOINTS
  // ─────────────────────────────────────────────
  readonly RH = {
    // General Demands
    GET_DEMAND_BY_ID: (id: number) => `${this.API_BASE}/rh/demandes/${id}`,
    GET_ALL_DEMANDS: `${this.API_BASE}/rh/demandes`,
    GET_RH_REQUESTS: `${this.API_BASE}/rh/demandes`,
    GET_MANAGER_DEMANDS: `${this.API_BASE}/demandes/manager`,
    GET_MANAGER_ALL_DEMANDS: `${this.API_BASE}/demandes/manager/all`,
    GET_MANAGER_PENDING_DEMANDS: `${this.API_BASE}/requests/manager/pending`,
    GET_RH_PENDING_DEMANDS: `${this.API_BASE}/rh/conges/rh/pending`,
    GET_RH_STATS: `${this.API_BASE}/rh/stats`,

    // Congés (Leave)
    GET_CONGES: `${this.API_BASE}/rh/conges`,
    GET_MY_CONGES: `${this.API_BASE}/rh/conges/me`,
    GET_MANAGER_CONGES: `${this.API_BASE}/rh/conges/manager`,
    GET_CONGE_BY_ID: (id: number) => `${this.API_BASE}/rh/conges/${id}`,
    CREATE_CONGE: `${this.API_BASE}/rh/conges`,
    VALIDATE_CONGE_MANAGER: (id: number) => `${this.API_BASE}/rh/conges/${id}/valider`,
    REJECT_CONGE_MANAGER: (id: number) => `${this.API_BASE}/rh/conges/${id}/refuser`,
    VALIDATE_CONGE_RH: (id: number) => `${this.API_BASE}/rh/conges/${id}/valider-rh`,
    REJECT_CONGE_RH: (id: number) => `${this.API_BASE}/rh/conges/${id}/refuser-rh`,
    CANCEL_CONGE: (id: number) => `${this.API_BASE}/rh/conges/${id}/cancel`,

    // Absences
    GET_ABSENCES: `${this.API_BASE}/rh/absences`,
    GET_MY_ABSENCES: `${this.API_BASE}/rh/absences/mes-absences`,
    GET_MANAGER_ABSENCES: `${this.API_BASE}/rh/absences/entreprise`,
    CREATE_ABSENCE: `${this.API_BASE}/rh/absences`,
    VALIDATE_ABSENCE_MANAGER: (id: number) => `${this.API_BASE}/rh/absences/${id}/valider`,
    REJECT_ABSENCE_MANAGER: (id: number) => `${this.API_BASE}/rh/absences/${id}/rejeter`,
    VALIDATE_ABSENCE_RH: (id: number) => `${this.API_BASE}/rh/absences/${id}/valider`,
    REJECT_ABSENCE_RH: (id: number) => `${this.API_BASE}/rh/absences/${id}/rejeter`,

    // Telecommuting
    GET_TELETRAVAILS: `${this.API_BASE}/rh/teletravails`,
    GET_MY_TELETRAVAILS: `${this.API_BASE}/rh/teletravails/mes-demandes`,
    GET_MANAGER_TELETRAVAILS: `${this.API_BASE}/rh/teletravails/demandes-equipe`,
    CREATE_TELETRAVAIL: `${this.API_BASE}/rh/teletravails`,
    VALIDATE_TELETRAVAIL_MANAGER: (id: number) => `${this.API_BASE}/rh/teletravails/${id}/valider-manager`,
    REJECT_TELETRAVAIL_MANAGER: (id: number) => `${this.API_BASE}/rh/teletravails/${id}/rejeter-manager`,
    VALIDATE_TELETRAVAIL_RH: (id: number) => `${this.API_BASE}/rh/teletravails/${id}/valider-rh`,
    REJECT_TELETRAVAIL_RH: (id: number) => `${this.API_BASE}/rh/teletravails/${id}/rejeter-rh`,

    // Authorisations
    GET_AUTORISATIONS: `${this.API_BASE}/rh/autorisations`,
    GET_MY_AUTORISATIONS: `${this.API_BASE}/rh/autorisations/me`,
    GET_EMPLOYEE_AUTORISATION_KPIS: `${this.API_BASE}/rh/autorisations/kpis/employee`,
    CREATE_AUTORISATION: `${this.API_BASE}/rh/autorisations`,
    CANCEL_AUTORISATION: (id: number) => `${this.API_BASE}/rh/autorisations/${id}/cancel`,
    VALIDATE_AUTORISATION_MANAGER: (id: number) => `${this.API_BASE}/rh/autorisations/${id}/manager/validate`,
    REJECT_AUTORISATION_MANAGER: (id: number) => `${this.API_BASE}/rh/autorisations/${id}/reject`,

    // Documents
    GET_DOCUMENTS: `${this.API_BASE}/documents`,
    GET_MY_DOCUMENTS: `${this.API_BASE}/documents/mes-demandes`,
    CREATE_DOCUMENT: `${this.API_BASE}/documents`,
    CANCEL_DOCUMENT: (id: number) => `${this.API_BASE}/documents/${id}/annuler`,
    DOWNLOAD_DOCUMENT: (id: number) => `${this.API_BASE}/documents/${id}/telecharger`,
    VALIDATE_DOCUMENT_MANAGER: (id: number) => `${this.API_BASE}/documents/${id}/validate/manager`,
    REJECT_DOCUMENT_MANAGER: (id: number) => `${this.API_BASE}/documents/${id}/reject`,

    // RH Configuration
    GET_TYPE_CONGES: `${this.API_BASE}/rh/type-conges`,
    CREATE_TYPE_CONGE: `${this.API_BASE}/rh/type-conges`,
    UPDATE_TYPE_CONGE: (id: number) => `${this.API_BASE}/rh/type-conges/${id}`,
    DELETE_TYPE_CONGE: (id: number) => `${this.API_BASE}/rh/type-conges/${id}`,

    GET_TYPE_ABSENCES: `${this.API_BASE}/rh/type-absences`,
    CREATE_TYPE_ABSENCE: `${this.API_BASE}/rh/type-absences`,
    UPDATE_TYPE_ABSENCE: (id: number) => `${this.API_BASE}/rh/type-absences/${id}`,
    DELETE_TYPE_ABSENCE: (id: number) => `${this.API_BASE}/rh/type-absences/${id}`,

    GET_SOLDE_CONGES: (annee: number) => `${this.API_BASE}/rh/solde-conges/me/all?annee=${annee}`,
    GET_SOLDE_CONGE_BY_ID: (id: number, annee: number) => `${this.API_BASE}/rh/solde-conges/me?typeCongeId=${id}&annee=${annee}`,
    GET_USER_SOLDE_CONGES: (userId: number, annee: number) => `${this.API_BASE}/rh/solde-conges/users/${userId}?annee=${annee}`,
    UPDATE_SOLDE_CONGE: (id: number) => `${this.API_BASE}/rh/solde-conges/${id}`,
    GET_LEAVE_BALANCE: (annee: number) => `${this.API_BASE}/rh/solde-conges/me/all?annee=${annee}`,

    // Statistics
    GET_STATS_DEMANDS_BY_TYPE: `${this.API_BASE}/rh/stats/demandes-par-type`,
    GET_STATS_EVOLUTION: `${this.API_BASE}/rh/stats/evolution-mensuelle`,
    GET_MANAGER_STATS: `${this.API_BASE}/manager/stats`,
    GET_RH_DASHBOARD: `${this.API_BASE}/rh/dashboard`,

    // AI Features
    GET_AI_SUGGESTIONS: (demandeId: number) => `${this.API_BASE}/rh/ai/suggestions/${demandeId}`,

    // Public Holidays (Jours Fériés)
    GET_JOURS_FERIES: `${this.API_BASE}/rh/jours-feries`,
    GET_JOURS_FERIES_BY_RANGE: `${this.API_BASE}/rh/jours-feries/range`,
    GET_JOURS_FERIES_BY_ID: (id: number) => `${this.API_BASE}/rh/jours-feries/${id}`,
    CREATE_JOUR_FERIE: `${this.API_BASE}/rh/jours-feries`,
    UPDATE_JOUR_FERIE: (id: number) => `${this.API_BASE}/rh/jours-feries/${id}`,
    DELETE_JOUR_FERIE: (id: number) => `${this.API_BASE}/rh/jours-feries/${id}`,
    CHECK_JOUR_FERIE: (date: string) => `${this.API_BASE}/rh/jours-feries/check/${date}`
  };

  // ─────────────────────────────────────────────
  // PRESENCE ENDPOINTS
  // ─────────────────────────────────────────────
  readonly PRESENCE = {
    CHECK_IN: `${this.API_BASE}/presence/check-in`,
    CHECK_OUT: `${this.API_BASE}/presence/check-out`,
    GET_ACTIVE_SESSION: `${this.API_BASE}/presence/active-session`,
    GET_TODAY_PRESENCE: `${this.API_BASE}/presence/today`,
    GET_MY_TODAY: `${this.API_BASE}/presence/me/today`,
    GET_PRESENCE_HISTORY: `${this.API_BASE}/presence/history`,
    GET_MY_HISTORY: `${this.API_BASE}/presence/me/history`,
    GET_TEAM_PRESENCE: `${this.API_BASE}/presence/manager/team`,
    GET_TEAM_TODAY: `${this.API_BASE}/presence/team/today`,
    GET_TEAM_HISTORY: `${this.API_BASE}/presence/team/history`,
    GET_COMPANY_TODAY: `${this.API_BASE}/presence/company/today`,
    GET_COMPANY_STATS: `${this.API_BASE}/presence/company/stats`,
    GET_PRESENCE_STATS: `${this.API_BASE}/presence/stats`,
    GET_MY_STATS: `${this.API_BASE}/presence/me/stats`,
    GET_GLOBAL_ANALYTICS: `${this.API_BASE}/presence/global/analytics`
  };

  readonly NOTIFICATIONS = {
    GET_ALL: `${this.API_BASE}/notifications`,
    GET_UNREAD_COUNT: `${this.API_BASE}/notifications/unread-count`,
    MARK_AS_READ: (id: number) => `${this.API_BASE}/notifications/${id}/read`,
    MARK_ALL_AS_READ: `${this.API_BASE}/notifications/read-all`
  };

  // ─────────────────────────────────────────────
  // WEBSOCKET ENDPOINTS
  // ─────────────────────────────────────────────
  readonly WEBSOCKET = {
    RH_SERVICE: environment.websocket.rh,
    PRESENCE_SERVICE: environment.websocket.presence,
    NOTIFICATIONS_SERVICE: environment.websocket.notifications,
    TOPIC_PREFIX: '/topic',
    APP_PREFIX: '/app'
  };

  constructor() {}
}
