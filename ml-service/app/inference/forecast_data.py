"""Real data extraction for absence and leave forecasts.

The service databases are separated by bounded context, so the extractor reads
each database independently and joins records in Python by user/team/company.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.database import get_session_for_url

logger = logging.getLogger(__name__)

APPROVED_STATUSES = {"APPROUVE", "APPROUVEE", "APPROVED"}
REFUSED_STATUSES = {"REFUSE", "REFUSEE", "ANNULE", "ANNULEE", "CANCELLED", "CANCELED"}
PENDING_STATUSES = {"EN_ATTENTE", "EN_ATTENTE_MANAGER", "EN_ATTENTE_RH", "PENDING"}


@dataclass(slots=True)
class EmployeeProfile:
    employee_id: int
    employee_name: str
    company_id: int | None = None
    department_id: int | None = None
    department_name: str | None = None
    team_id: int | None = None
    team_name: str | None = None
    manager_id: int | None = None


@dataclass(slots=True)
class ForecastEvent:
    event_type: str
    employee_id: int
    start_date: date
    end_date: date
    status: str
    request_id: int | None = None
    company_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    days: float = 1.0

    @property
    def is_approved(self) -> bool:
        return normalize_status(self.status) in APPROVED_STATUSES

    @property
    def is_pending(self) -> bool:
        return normalize_status(self.status) in PENDING_STATUSES

    @property
    def is_refused(self) -> bool:
        return normalize_status(self.status) in REFUSED_STATUSES


@dataclass(slots=True)
class PresenceEvent:
    employee_id: int
    event_date: date
    company_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    daily_status: str | None = None
    late_arrival: bool = False
    worked_minutes: int = 0
    expected_minutes: int = 0

    @property
    def is_absent(self) -> bool:
        return normalize_status(self.daily_status) == "ABSENT"

    @property
    def is_remote(self) -> bool:
        return normalize_status(self.daily_status) in {"REMOTE", "TELEWORK", "TELETRAVAIL"}


@dataclass(slots=True)
class ForecastDataset:
    employees: list[EmployeeProfile] = field(default_factory=list)
    leave_events: list[ForecastEvent] = field(default_factory=list)
    absence_events: list[ForecastEvent] = field(default_factory=list)
    telework_events: list[ForecastEvent] = field(default_factory=list)
    presence_events: list[PresenceEvent] = field(default_factory=list)
    holidays: set[date] = field(default_factory=set)
    leave_balances: dict[int, float] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    source_ok: dict[str, bool] = field(default_factory=lambda: {
        "organisation": False,
        "rh": False,
        "presence": False,
    })

    def employee_ids(self) -> set[int]:
        ids = {employee.employee_id for employee in self.employees}
        ids.update(event.employee_id for event in self.leave_events)
        ids.update(event.employee_id for event in self.absence_events)
        ids.update(event.employee_id for event in self.presence_events)
        return ids


@dataclass(slots=True)
class ForecastDataFilters:
    company_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    employee_id: int | None = None
    manager_id: int | None = None


def normalize_status(value: Any) -> str:
    return str(value or "").strip().upper()


def parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def iter_dates(start: date, end: date) -> Iterable[date]:
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


class ForecastDataRepository:
    def __init__(self) -> None:
        self.settings = get_settings()

    def load_dataset(
        self,
        *,
        history_start: date,
        forecast_end: date,
        filters: ForecastDataFilters,
    ) -> ForecastDataset:
        dataset = ForecastDataset()
        dataset.employees = self._load_employees(dataset, filters)
        employees_by_id = {employee.employee_id: employee for employee in dataset.employees}
        dataset.leave_events, dataset.absence_events, dataset.telework_events = self._load_rh_events(
            dataset,
            history_start,
            forecast_end,
            filters,
            employees_by_id,
        )
        dataset.holidays = self._load_holidays(dataset, history_start, forecast_end, filters)
        dataset.leave_balances = self._load_leave_balances(dataset, filters)
        dataset.presence_events = self._load_presence_events(
            dataset,
            history_start,
            forecast_end,
            filters,
            employees_by_id,
        )
        return self._apply_filters(dataset, filters)

    def _load_employees(self, dataset: ForecastDataset, filters: ForecastDataFilters) -> list[EmployeeProfile]:
        sql = text(
            """
            select
                u.id as employee_id,
                trim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')) as employee_name,
                u.entreprise_id as company_id,
                u.departement_id as department_id,
                d.nom as department_name,
                u.equipe_id as team_id,
                e.nom as team_name,
                u.manager_id as manager_id
            from utilisateurs u
            left join departements d on d.id = u.departement_id
            left join equipes e on e.id = u.equipe_id
            where (:company_id is null or u.entreprise_id = :company_id)
            """
        )
        params = {"company_id": filters.company_id}
        rows = self._query("organisation", self.settings.organisation_database_url, sql, params, dataset)
        employees: list[EmployeeProfile] = []
        for row in rows:
            employee = EmployeeProfile(
                employee_id=int(row["employee_id"]),
                employee_name=str(row.get("employee_name") or "").strip() or f"Employe #{row['employee_id']}",
                company_id=_int_or_none(row.get("company_id")),
                department_id=_int_or_none(row.get("department_id")),
                department_name=_str_or_none(row.get("department_name")),
                team_id=_int_or_none(row.get("team_id")),
                team_name=_str_or_none(row.get("team_name")),
                manager_id=_int_or_none(row.get("manager_id")),
            )
            employees.append(employee)
        return employees

    def _load_rh_events(
        self,
        dataset: ForecastDataset,
        history_start: date,
        forecast_end: date,
        filters: ForecastDataFilters,
        employees_by_id: dict[int, EmployeeProfile],
    ) -> tuple[list[ForecastEvent], list[ForecastEvent], list[ForecastEvent]]:
        leave_sql = text(
            """
            select
                d.id as request_id,
                d.utilisateur_id as employee_id,
                d.entreprise_id as company_id,
                d.manager_id as manager_id,
                d.statut as status,
                c.date_debut as start_date,
                c.date_fin as end_date,
                c.nombre_jours as days
            from demandes d
            join conges c on c.demande_id = d.id
            where c.date_fin >= :history_start
              and c.date_debut <= :forecast_end
              and (:company_id is null or d.entreprise_id = :company_id)
            """
        )
        absence_sql = text(
            """
            select
                d.id as request_id,
                d.utilisateur_id as employee_id,
                d.entreprise_id as company_id,
                d.manager_id as manager_id,
                d.statut as status,
                a.date_debut as start_date,
                a.date_fin as end_date,
                coalesce(a.duree_jours, 1) as days
            from demandes d
            join absences a on a.demande_id = d.id
            where a.date_fin >= :history_start
              and a.date_debut <= :forecast_end
              and (:company_id is null or d.entreprise_id = :company_id)
            """
        )
        telework_sql = text(
            """
            select
                d.id as request_id,
                d.utilisateur_id as employee_id,
                d.entreprise_id as company_id,
                d.manager_id as manager_id,
                d.statut as status,
                t.date_debut as start_date,
                t.date_fin as end_date,
                coalesce(t.nombre_jours, 1) as days
            from demandes d
            join teletravails t on t.demande_id = d.id
            where t.date_fin >= :history_start
              and t.date_debut <= :forecast_end
              and (:company_id is null or d.entreprise_id = :company_id)
            """
        )
        params = {
            "history_start": history_start,
            "forecast_end": forecast_end,
            "company_id": filters.company_id,
        }
        leave_events = self._events_from_rows(
            self._query("rh", self.settings.rh_database_url, leave_sql, params, dataset),
            "LEAVE",
            employees_by_id,
        )
        absence_events = self._events_from_rows(
            self._query("rh", self.settings.rh_database_url, absence_sql, params, dataset),
            "ABSENCE",
            employees_by_id,
        )
        telework_events = self._events_from_rows(
            self._query("rh", self.settings.rh_database_url, telework_sql, params, dataset),
            "REMOTE",
            employees_by_id,
        )
        return leave_events, absence_events, telework_events

    def _load_holidays(
        self,
        dataset: ForecastDataset,
        history_start: date,
        forecast_end: date,
        filters: ForecastDataFilters,
    ) -> set[date]:
        sql = text(
            """
            select date
            from jours_feries
            where date between :history_start and :forecast_end
              and (:company_id is null or entreprise_id is null or entreprise_id = :company_id)
            """
        )
        rows = self._query(
            "rh",
            self.settings.rh_database_url,
            sql,
            {
                "history_start": history_start,
                "forecast_end": forecast_end,
                "company_id": filters.company_id,
            },
            dataset,
        )
        return {parsed for row in rows if (parsed := parse_date(row.get("date"))) is not None}

    def _load_leave_balances(self, dataset: ForecastDataset, filters: ForecastDataFilters) -> dict[int, float]:
        sql = text(
            """
            select utilisateur_id as employee_id, coalesce(sum(jours_restants), 0) as remaining_days
            from solde_conges
            where (:company_id is null or entreprise_id is null or entreprise_id = :company_id)
            group by utilisateur_id
            """
        )
        rows = self._query(
            "rh",
            self.settings.rh_database_url,
            sql,
            {"company_id": filters.company_id},
            dataset,
        )
        balances: dict[int, float] = {}
        for row in rows:
            employee_id = _int_or_none(row.get("employee_id"))
            if employee_id is not None:
                balances[employee_id] = float(row.get("remaining_days") or 0)
        return balances

    def _load_presence_events(
        self,
        dataset: ForecastDataset,
        history_start: date,
        forecast_end: date,
        filters: ForecastDataFilters,
        employees_by_id: dict[int, EmployeeProfile],
    ) -> list[PresenceEvent]:
        sql = text(
            """
            select
                utilisateur_id as employee_id,
                entreprise_id as company_id,
                attendance_date as event_date,
                daily_status,
                late_arrival,
                coalesce(worked_minutes, 0) as worked_minutes,
                coalesce(expected_minutes, 0) as expected_minutes
            from attendance_sessions
            where attendance_date between :history_start and :forecast_end
              and (:company_id is null or entreprise_id is null or entreprise_id = :company_id)
            """
        )
        rows = self._query(
            "presence",
            self.settings.presence_database_url or self.settings.database_url,
            sql,
            {
                "history_start": history_start,
                "forecast_end": forecast_end,
                "company_id": filters.company_id,
            },
            dataset,
        )
        events: list[PresenceEvent] = []
        for row in rows:
            event_date = parse_date(row.get("event_date"))
            employee_id = _int_or_none(row.get("employee_id"))
            if event_date is None or employee_id is None:
                continue
            profile = employees_by_id.get(employee_id)
            events.append(
                PresenceEvent(
                    employee_id=employee_id,
                    event_date=event_date,
                    company_id=_int_or_none(row.get("company_id")) or (profile.company_id if profile else None),
                    department_id=profile.department_id if profile else None,
                    team_id=profile.team_id if profile else None,
                    daily_status=_str_or_none(row.get("daily_status")),
                    late_arrival=bool(row.get("late_arrival")),
                    worked_minutes=int(row.get("worked_minutes") or 0),
                    expected_minutes=int(row.get("expected_minutes") or 0),
                )
            )
        return events

    def _events_from_rows(
        self,
        rows: list[dict[str, Any]],
        event_type: str,
        employees_by_id: dict[int, EmployeeProfile],
    ) -> list[ForecastEvent]:
        events: list[ForecastEvent] = []
        seen: set[tuple[str, int | None, int, date, date]] = set()
        for row in rows:
            employee_id = _int_or_none(row.get("employee_id"))
            start = parse_date(row.get("start_date"))
            end = parse_date(row.get("end_date")) or start
            if employee_id is None or start is None or end is None:
                continue
            status = normalize_status(row.get("status"))
            if status in REFUSED_STATUSES:
                continue
            if end < start:
                start, end = end, start
            request_id = _int_or_none(row.get("request_id"))
            key = (event_type, request_id, employee_id, start, end)
            if key in seen:
                continue
            seen.add(key)
            profile = employees_by_id.get(employee_id)
            events.append(
                ForecastEvent(
                    event_type=event_type,
                    employee_id=employee_id,
                    start_date=start,
                    end_date=end,
                    status=status,
                    request_id=request_id,
                    company_id=_int_or_none(row.get("company_id")) or (profile.company_id if profile else None),
                    department_id=profile.department_id if profile else None,
                    team_id=profile.team_id if profile else None,
                    days=float(row.get("days") or ((end - start).days + 1)),
                )
            )
        return events

    def _query(
        self,
        source_name: str,
        database_url: str,
        sql: Any,
        params: dict[str, Any],
        dataset: ForecastDataset,
    ) -> list[dict[str, Any]]:
        try:
            with get_session_for_url(database_url) as session:
                rows = session.execute(sql, params).mappings().all()
            dataset.source_ok[source_name] = True
            return [dict(row) for row in rows]
        except SQLAlchemyError as exc:
            logger.warning("forecast %s query failed: %s", source_name, exc)
            dataset.warnings.append(f"{source_name}_unavailable")
            return []

    def _apply_filters(self, dataset: ForecastDataset, filters: ForecastDataFilters) -> ForecastDataset:
        employees_by_id = {employee.employee_id: employee for employee in dataset.employees}

        def employee_allowed(employee_id: int) -> bool:
            profile = employees_by_id.get(employee_id)
            if filters.employee_id is not None and employee_id != filters.employee_id:
                return False
            if profile is None:
                return True
            if filters.department_id is not None and profile.department_id != filters.department_id:
                return False
            if filters.team_id is not None and profile.team_id != filters.team_id:
                return False
            if filters.manager_id is not None and profile.manager_id != filters.manager_id:
                return False
            return True

        dataset.employees = [
            employee
            for employee in dataset.employees
            if employee_allowed(employee.employee_id)
        ]
        dataset.leave_events = [event for event in dataset.leave_events if employee_allowed(event.employee_id)]
        dataset.absence_events = [event for event in dataset.absence_events if employee_allowed(event.employee_id)]
        dataset.telework_events = [event for event in dataset.telework_events if employee_allowed(event.employee_id)]
        dataset.presence_events = [event for event in dataset.presence_events if employee_allowed(event.employee_id)]
        return dataset


def _int_or_none(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _str_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
