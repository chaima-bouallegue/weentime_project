import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, of } from 'rxjs';
import { RhPlanningService, PlanningResponseDTO, EmployeeStatusDTO } from '@app/features/rh/planning/rh-planning.service';
import { OrganisationService, SimpleTeam } from '@app/core/services/organisation.service';

// ════════════════════════════════════════════════════════════════════════════
// MOCK CALENDRIER GLOBAL RH — ENTREPRISE IT SERV
// Responsable RH : Chaima Blg (chaima@itserv.com)
// Équipes : Direction, Frontend, Backend
// Données calibrées pour démonstration soutenance
// ════════════════════════════════════════════════════════════════════════════

export const MOCK_EMPLOYEES: Omit<EmployeeStatusDTO, 'status' | 'detail'>[] = [
  { id: 6,   name: 'Blg',        prenom: 'Chaima', email: 'chaima@itserv.com',           poste: 'Responsable RH',    departementName: 'Direction',    teamName: 'Direction', photoUrl: '' },
  { id: 8,   name: 'Bouallegue', prenom: 'Chaima', email: 'chaimabouallegue@itserv.com', poste: 'Lead Frontend',     departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 9,   name: 'Medini',     prenom: 'Hayet',  email: 'hayet@itserv.com',            poste: 'UI/UX Designer',    departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 15,  name: 'Dhif',       prenom: 'Mayar',  email: 'mayar@itserv.com',            poste: 'React Developer',   departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 101, name: 'Chikha',     prenom: 'Amal',   email: 'amal@itserv.com',             poste: 'Développeuse Web',  departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 10,  name: 'Bouallegue', prenom: 'Molka',  email: 'molka@itserv.com',            poste: 'Backend Team Lead', departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 23,  name: 'Sannen',     prenom: 'Assia',  email: 'assia@itserv.com',            poste: 'Java Developer',    departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 11,  name: 'Bouallegue', prenom: 'Firas',  email: 'firas@itserv.com',            poste: 'API Developer',     departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 14,  name: 'Wechtati',   prenom: 'Marwa',  email: 'marwa@itserv.com',            poste: 'Développeuse Java', departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 17,  name: 'Bouallegue', prenom: 'Yahya',  email: 'yahya@itserv.com',            poste: 'Laravel Developer', departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 16,  name: 'Boulifa',    prenom: 'Hiba',   email: 'hiba@itserv.com',             poste: 'Java Developer',    departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
];

export const MOCK_TEAMS: SimpleTeam[] = [
  { id: 1, nom: 'Direction' } as any,
  { id: 2, nom: 'Frontend' } as any,
  { id: 3, nom: 'Backend' } as any,
];

export const TUNISIAN_FRENCH_HOLIDAYS: Record<string, string> = {
  '2026-01-01': "Jour de l'An",
  '2026-03-20': "Fête de l'Indépendance",
  '2026-04-09': "Jour des Martyrs",
  '2026-05-01': "Fête du Travail",
  '2026-07-25': "Fête de la République",
  '2026-08-13': "Fête de la Femme",
  '2026-10-15': "Fête de l'Évacuation",
  '2026-11-01': "Toussaint",
  '2026-11-11': "Armistice",
  '2026-12-25': "Noël"
};

function _seedRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

type MockStatus = EmployeeStatusDTO['status'];

const ARRIVAL_TIMES = [
  '08:15', '08:18', '08:22', '08:25', '08:30', '08:34', '08:42', '08:48', '08:55', '09:02'
];

function _getEmployeesForTeam(teamId?: number): Omit<EmployeeStatusDTO, 'status' | 'detail'>[] {
  if (teamId === 1) return MOCK_EMPLOYEES.filter(e => e.teamName === 'Direction');
  if (teamId === 2) return MOCK_EMPLOYEES.filter(e => e.teamName === 'Frontend');
  if (teamId === 3) return MOCK_EMPLOYEES.filter(e => e.teamName === 'Backend');
  return MOCK_EMPLOYEES;
}

function _generateMockDay(dateStr: string, today: string, teamId?: number): PlanningResponseDTO {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d, 12, 0, 0);
  const dow = dateObj.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const pool = _getEmployeesForTeam(teamId);
  const dateType: PlanningResponseDTO['dateType'] = dateStr < today ? 'PAST' : dateStr === today ? 'TODAY' : 'FUTURE';

  // 1. Weekend / Repos
  if (isWeekend) {
    return {
      date: dateStr,
      employees: pool.map(e => ({ ...e, status: 'LEAVE' as MockStatus, detail: 'Weekend / Repos' })),
      presenceRate: 0,
      presenceText: 'Repos',
      isRestDay: true,
      dateType
    };
  }

  // 2. Jour Férié
  if (TUNISIAN_FRENCH_HOLIDAYS[dateStr]) {
    const holidayName = TUNISIAN_FRENCH_HOLIDAYS[dateStr];
    return {
      date: dateStr,
      employees: pool.map(e => ({ ...e, status: 'LEAVE' as MockStatus, detail: `Férié — ${holidayName}` })),
      presenceRate: 0,
      presenceText: 'Férié',
      isRestDay: true,
      dateType
    };
  }

  // 3. AUJOURD'HUI (TODAY) — Scénario réel temps réel pour démonstration soutenance
  if (dateType === 'TODAY') {
    const employees: EmployeeStatusDTO[] = pool.map(emp => {
      // Cas spécifiques cohérents pour la démo
      if (emp.id === 6) { // Chaima Blg (RH)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:15 (Bureau Direction)' };
      }
      if (emp.id === 8) { // Chaima Bouallegue (Lead Frontend)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:24 (Bureau Frontend)' };
      }
      if (emp.id === 9) { // Hayet Medini (UI/UX)
        return { ...emp, status: 'REMOTE' as MockStatus, detail: 'Télétravail validé (UI System)' };
      }
      if (emp.id === 15) { // Mayar Dhif (React Dev)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:42 (Bureau Frontend)' };
      }
      if (emp.id === 101) { // Amal Chikha (Dev Web)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:50 (Bureau Frontend)' };
      }
      if (emp.id === 10) { // Molka Bouallegue (Lead Backend)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:18 (Bureau Backend)' };
      }
      if (emp.id === 23) { // Assia Sannen (Java Dev)
        return { ...emp, status: 'LEAVE' as MockStatus, detail: 'En Congé payé (Reliquat)' };
      }
      if (emp.id === 11) { // Firas Bouallegue (API Dev)
        return { ...emp, status: 'PENDING' as MockStatus, detail: 'En attente de pointage' };
      }
      if (emp.id === 14) { // Marwa Wechtati (Java Dev)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:35 (Bureau Backend)' };
      }
      if (emp.id === 17) { // Yahya Bouallegue (Laravel Dev)
        return { ...emp, status: 'REMOTE' as MockStatus, detail: 'Télétravail validé (VPN IT SERV)' };
      }
      if (emp.id === 16) { // Hiba Boulifa (Java Dev)
        return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:38 (Bureau Backend)' };
      }

      return { ...emp, status: 'PRESENT' as MockStatus, detail: 'Présent — 08:30 (Badgeuse)' };
    });

    const active = employees.filter(e => e.status === 'PRESENT' || e.status === 'REMOTE');
    const rate = employees.length > 0 ? active.length / employees.length : 0;
    return {
      date: dateStr,
      employees,
      presenceRate: rate,
      presenceText: `${active.length}/${employees.length}`,
      isRestDay: false,
      dateType: 'TODAY'
    };
  }

  // 4. FUTUR (FUTURE) — Planning prévisionnel
  if (dateType === 'FUTURE') {
    const seed = y * 10000 + m * 100 + d + (teamId || 0);
    const rand = _seedRandom(seed);
    const employees: EmployeeStatusDTO[] = pool.map(emp => {
      const r = rand();
      // Chaima Blg (RH) est quasi toujours sur site
      if (emp.id === 6 && r < 0.90) {
        return { ...emp, status: 'SCHEDULED' as MockStatus, detail: 'Planifié (Bureau Direction)' };
      }
      if (r < 0.72) return { ...emp, status: 'SCHEDULED' as MockStatus, detail: 'Planifié (sur site)' };
      if (r < 0.90) return { ...emp, status: 'REMOTE' as MockStatus, detail: 'Télétravail planifié' };
      return { ...emp, status: 'LEAVE' as MockStatus, detail: 'Congé planifié' };
    });
    const active = employees.filter(e => e.status === 'SCHEDULED' || e.status === 'REMOTE');
    const rate = employees.length > 0 ? active.length / employees.length : 0;
    return {
      date: dateStr,
      employees,
      presenceRate: rate,
      presenceText: `${active.length}/${employees.length}`,
      isRestDay: false,
      dateType: 'FUTURE'
    };
  }

  // 5. PASSÉ (PAST) — Historique pointages badgeuse IT SERV
  const seed = y * 10000 + m * 100 + d + (teamId || 0);
  const rand = _seedRandom(seed);

  const employees: EmployeeStatusDTO[] = pool.map(emp => {
    const r = rand();
    if (r < 0.72) {
      const ti = (emp.id * 7 + d) % ARRIVAL_TIMES.length;
      return { ...emp, status: 'PRESENT' as MockStatus, detail: `Présent — ${ARRIVAL_TIMES[ti]} (Badgeuse)` };
    }
    if (r < 0.89) return { ...emp, status: 'REMOTE' as MockStatus, detail: 'Télétravail (VPN IT SERV)' };
    if (r < 0.96) return { ...emp, status: 'LEAVE' as MockStatus, detail: 'Congé annuel validé' };
    return { ...emp, status: 'ABSENCE' as MockStatus, detail: 'Absence autorisée' };
  });

  const active = employees.filter(e => e.status === 'PRESENT' || e.status === 'REMOTE');
  const rate = employees.length > 0 ? active.length / employees.length : 0;
  return {
    date: dateStr,
    employees,
    presenceRate: rate,
    presenceText: `${active.length}/${employees.length}`,
    isRestDay: false,
    dateType: 'PAST'
  };
}

function _generateMockPlanning(start: string, end: string, teamId?: number): PlanningResponseDTO[] {
  const result: PlanningResponseDTO[] = [];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const [sY, sM, sD] = start.split('-').map(Number);
  const [eY, eM, eD] = end.split('-').map(Number);
  const startDate = new Date(sY, sM - 1, sD, 12, 0, 0);
  const endDate = new Date(eY, eM - 1, eD, 12, 0, 0);
  
  for (let cur = new Date(startDate); cur <= endDate; cur.setDate(cur.getDate() + 1)) {
    const ds = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    result.push(_generateMockDay(ds, today, teamId));
  }
  return result;
}

// ════════════════════════════════════════════════════════════════════════════

@Injectable({ providedIn: 'root' })
export class PlanningStore {
  private readonly planningService = inject(RhPlanningService);
  private readonly organisationService = inject(OrganisationService);

  private readonly _planningData = signal<Record<string, PlanningResponseDTO[]>>({});
  private readonly _teams = signal<SimpleTeam[]>(MOCK_TEAMS);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly teams = computed(() => this._teams());
  readonly isLoading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  getPlanning(monthKey: string, teamId?: number): PlanningResponseDTO[] {
    const key = this._buildKey(monthKey, teamId);
    return this._planningData()[key] || [];
  }

  loadInitial(start: string, end: string, teamId?: number): Observable<any> {
    const key = this._buildKey(start.substring(0, 7), teamId);
    this._teams.set(MOCK_TEAMS);
    const data = _generateMockPlanning(start, end, teamId);
    this._updatePlanning(key, data);
    this._loading.set(false);
    return of({ teams: { content: MOCK_TEAMS }, planning: data });
  }

  loadPlanning(start: string, end: string, teamId?: number, force = false): Observable<PlanningResponseDTO[]> {
    const key = this._buildKey(start.substring(0, 7), teamId);
    const cached = this._planningData()[key];
    if (cached && cached.length > 0 && !force) {
      this._loading.set(false);
      return of(cached);
    }
    const data = _generateMockPlanning(start, end, teamId);
    this._updatePlanning(key, data);
    this._loading.set(false);
    return of(data);
  }

  private _buildKey(monthKey: string, teamId?: number): string {
    return teamId ? `${monthKey}_team_${teamId}` : monthKey;
  }

  private _updatePlanning(key: string, data: PlanningResponseDTO[]) {
    this._planningData.update(prev => ({ ...prev, [key]: data }));
  }
}
