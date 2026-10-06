import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, of } from 'rxjs';
import { RhPlanningService, PlanningResponseDTO, EmployeeStatusDTO } from '@app/features/rh/planning/rh-planning.service';
import { OrganisationService, SimpleTeam } from '@app/core/services/organisation.service';

// ════════════════════════════════════════════════════════════════════════════
// MOCK INSTANTANÉ — Vrais employés IT SERV (chaima@itserv.com)
// Département Informatique — Équipes Frontend & Backend
// Aucun appel API, aucun accès DB, chargement immédiat.
// ════════════════════════════════════════════════════════════════════════════

const MOCK_EMPLOYEES: Omit<EmployeeStatusDTO, 'status' | 'detail'>[] = [
  { id: 6,   name: 'Blg',        prenom: 'Chaima', email: 'chaima@itserv.com',           poste: 'RH',                departementName: 'Informatique', teamName: 'Direction', photoUrl: '' },
  { id: 8,   name: 'Bouallegue', prenom: 'Chaima', email: 'chaimabouallegue@itserv.com', poste: 'Lead Frontend',     departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 9,   name: 'Medini',     prenom: 'Hayet',  email: 'hayet@itserv.com',            poste: 'UI/UX Designer',    departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 15,  name: 'Dhif',       prenom: 'Mayar',  email: 'mayar@itserv.com',            poste: 'React Developer',   departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 101, name: 'Chikha',     prenom: 'Amal',   email: 'amal@itserv.com',             poste: 'Développeur web',   departementName: 'Informatique', teamName: 'Frontend',  photoUrl: '' },
  { id: 10,  name: 'Bouallegue', prenom: 'Molka',  email: 'molka@itserv.com',            poste: 'Backend Team Lead', departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 23,  name: 'Sannen',     prenom: 'Assia',  email: 'assia@itserv.com',            poste: 'Java Developer',    departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 11,  name: 'Bouallegue', prenom: 'Firas',  email: 'firas@itserv.com',            poste: 'Api Developer',     departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 14,  name: 'Wechtati',   prenom: 'Marwa',  email: 'marwa@itserv.com',            poste: 'Développeur Java',  departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 17,  name: 'Bouallegue', prenom: 'Yahya',  email: 'yahya@itserv.com',            poste: 'Laravel Developer', departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
  { id: 16,  name: 'Boulifa',    prenom: 'Hiba',   email: 'hiba@itserv.com',             poste: 'Java Developer',    departementName: 'Informatique', teamName: 'Backend',   photoUrl: '' },
];

const MOCK_TEAMS: SimpleTeam[] = [
  { id: 2, nom: 'Frontend' } as any,
  { id: 3, nom: 'Backend' } as any,
];

function _seedRandom(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

type MockStatus = EmployeeStatusDTO['status'];

const ARRIVAL_TIMES = [
  '08:15', '08:22', '08:28', '08:32', '08:45', '08:50', '08:58', '09:05'
];

function _getEmployeesForTeam(teamId?: number): Omit<EmployeeStatusDTO, 'status' | 'detail'>[] {
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

  if (isWeekend) {
    return {
      date: dateStr,
      employees: pool.map(e => ({ ...e, status: 'LEAVE' as MockStatus, detail: 'Weekend / Repos' })),
      presenceRate: 0, presenceText: 'Repos', isRestDay: true, dateType
    };
  }

  if (dateType === 'FUTURE') {
    const seed = y * 10000 + m * 100 + d + (teamId || 0);
    const rand = _seedRandom(seed);
    const employees: EmployeeStatusDTO[] = pool.map(emp => {
      const r = rand();
      if (r < 0.75) return { ...emp, status: 'SCHEDULED' as MockStatus, detail: 'Planifié' };
      if (r < 0.92) return { ...emp, status: 'REMOTE' as MockStatus, detail: 'Télétravail' };
      return { ...emp, status: 'LEAVE' as MockStatus, detail: 'Congé' };
    });
    const active = employees.filter(e => e.status === 'SCHEDULED' || e.status === 'REMOTE');
    return { date: dateStr, employees, presenceRate: active.length / employees.length, presenceText: `${active.length}/${employees.length}`, isRestDay: false, dateType: 'FUTURE' };
  }

  // PAST & TODAY — ~70% présent, ~18% remote, ~8% congé, ~4% absent → presque tout vert / orangé
  const seed = y * 10000 + m * 100 + d + (teamId || 0);
  const rand = _seedRandom(seed);

  const employees: EmployeeStatusDTO[] = pool.map(emp => {
    const r = rand();
    if (r < 0.70) {
      const ti = (emp.id * 7 + d) % ARRIVAL_TIMES.length;
      return { ...emp, status: 'PRESENT' as MockStatus, detail: `Présent — ${ARRIVAL_TIMES[ti]}` };
    }
    if (r < 0.88) return { ...emp, status: 'REMOTE' as MockStatus, detail: 'Télétravail' };
    if (r < 0.96) return { ...emp, status: 'LEAVE' as MockStatus, detail: 'Congé' };
    return { ...emp, status: 'ABSENCE' as MockStatus, detail: 'Absent' };
  });

  const active = employees.filter(e => e.status === 'PRESENT' || e.status === 'REMOTE');
  return { date: dateStr, employees, presenceRate: active.length / employees.length, presenceText: `${active.length}/${employees.length}`, isRestDay: false, dateType };
}

function _generateMockPlanning(start: string, end: string, teamId?: number): PlanningResponseDTO[] {
  const result: PlanningResponseDTO[] = [];
  const today = '2026-09-23';
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
    this._updatePlanning(key, _generateMockPlanning(start, end, teamId));
    this._loading.set(false);
    return of({ teams: { content: MOCK_TEAMS }, planning: this._planningData()[key] });
  }

  loadPlanning(start: string, end: string, teamId?: number, force = false): Observable<PlanningResponseDTO[]> {
    const key = this._buildKey(start.substring(0, 7), teamId);
    const cached = this._planningData()[key];
    if (cached && cached.length > 0 && !force) { this._loading.set(false); return of(cached); }
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
