"""Inference service for absence and leave forecasts."""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from statistics import mean
from typing import Iterable, Literal

from app.core.config import get_settings
from app.features.forecast_features import (
    ForecastFeatureBuilder,
    ForecastFeatureRow,
    risk_from_metrics,
)
from app.inference.forecast_data import (
    APPROVED_STATUSES,
    ForecastDataFilters,
    ForecastDataRepository,
    ForecastDataset,
    ForecastEvent,
    PresenceEvent,
    iter_dates,
    normalize_status,
)
from app.models.forecast_model import AbsenceLeaveForecastModel
from app.schemas.forecast_schemas import (
    ForecastDashboardResponse,
    ForecastDataQuality,
    ForecastDataQualityStatus,
    ForecastEmployeeRisk,
    ForecastEmployeeRiskResponse,
    ForecastHealthResponse,
    ForecastListResponse,
    ForecastRiskLevel,
    ForecastSeriesPoint,
    ForecastSummary,
    ForecastTeamPrediction,
    ForecastTeamPresenceResponse,
    ForecastWorkloadLevel,
    ForecastWorkloadResponse,
)

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class ForecastQuery:
    period: str = "next_30_days"
    start_date: date | None = None
    end_date: date | None = None
    company_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    employee_id: int | None = None


@dataclass(slots=True)
class ForecastAccessContext:
    role: str
    user_id: int | None = None
    company_id: int | None = None
    manager_id: int | None = None


@dataclass(slots=True)
class _ResolvedPeriod:
    label: str
    start: date
    end: date


@dataclass(slots=True)
class _GroupMeta:
    employee_ids: set[int]
    employee_count: int
    team_id: int | None = None
    team_name: str = "Non assigne"
    department_id: int | None = None
    department_name: str | None = None


@dataclass(slots=True)
class _PredictionBundle:
    series: list[ForecastSeriesPoint]
    risk: ForecastRiskLevel


class ForecastService:
    """Builds forecasts from real WeenTime database rows.

    The service never fabricates employees or requests. If the model is absent
    or the data is too sparse, it returns a transparent moving-average forecast
    and marks ``dataQuality.fallbackUsed``.
    """

    def __init__(
        self,
        repository: ForecastDataRepository | None = None,
        model: AbsenceLeaveForecastModel | None = None,
    ) -> None:
        self.repository = repository or ForecastDataRepository()
        self.feature_builder = ForecastFeatureBuilder()
        if model is not None:
            self.model = model
        else:
            settings = get_settings()
            self.model = AbsenceLeaveForecastModel.load_latest(settings.model_dir_path)

    def reload_model(self) -> None:
        settings = get_settings()
        self.model = AbsenceLeaveForecastModel.load_latest(settings.model_dir_path)

    def health(self) -> ForecastHealthResponse:
        model_loaded = bool(self.model and self.model.is_ready)
        return ForecastHealthResponse(
            success=True,
            status="ok",
            model_loaded=model_loaded,
            model_version=self.model.model_version if self.model else None,
            metrics=self.model.metrics if self.model else {},
        )

    def build_dashboard(
        self,
        query: ForecastQuery,
        context: ForecastAccessContext,
    ) -> ForecastDashboardResponse:
        period, dataset, quality = self._load(query, context)
        group = self._overall_group(dataset)
        bundle = self._predict_group(dataset, period, group, quality)
        teams = self._team_predictions(dataset, period, quality)
        summary = self._summary(bundle.series, group.employee_count)
        summary.risk_level = self._max_risk([bundle.risk, *(team.risk_level for team in teams)])
        summary.predicted_workload = self._workload_level(dataset, period, group.employee_count)
        explanations = self._dashboard_explanations(dataset, quality, group.employee_count, teams)
        return ForecastDashboardResponse(
            success=True,
            period=period.label,
            generated_at=datetime.now(timezone.utc),
            summary=summary,
            series=bundle.series,
            teams=teams,
            explanations=explanations,
            data_quality=quality,
        )

    def build_list(
        self,
        kind: Literal["leaves", "absences"],
        query: ForecastQuery,
        context: ForecastAccessContext,
    ) -> ForecastListResponse:
        period, dataset, quality = self._load(query, context)
        group = self._overall_group(dataset)
        bundle = self._predict_group(dataset, period, group, quality)
        items = []
        for point in bundle.series:
            if kind == "leaves":
                items.append(
                    point.model_copy(
                        update={
                            "predicted_absences": 0.0,
                            "actual_absences": None,
                        }
                    )
                )
            else:
                items.append(
                    point.model_copy(
                        update={
                            "predicted_leaves": 0.0,
                            "actual_leaves": None,
                        }
                    )
                )
        return ForecastListResponse(
            success=True,
            period=period.label,
            generated_at=datetime.now(timezone.utc),
            items=items,
            data_quality=quality,
        )

    def team_presence(
        self,
        query: ForecastQuery,
        context: ForecastAccessContext,
    ) -> ForecastTeamPresenceResponse:
        period, dataset, quality = self._load(query, context)
        return ForecastTeamPresenceResponse(
            success=True,
            period=period.label,
            generated_at=datetime.now(timezone.utc),
            teams=self._team_predictions(dataset, period, quality),
            data_quality=quality,
        )

    def workload(
        self,
        query: ForecastQuery,
        context: ForecastAccessContext,
    ) -> ForecastWorkloadResponse:
        period, dataset, quality = self._load(query, context)
        group = self._overall_group(dataset)
        pending, approved = self._request_counts(dataset, period)
        level = self._workload_level(dataset, period, group.employee_count)
        return ForecastWorkloadResponse(
            success=True,
            period=period.label,
            generated_at=datetime.now(timezone.utc),
            predicted_workload=level,
            pending_requests_count=pending,
            approved_requests_count=approved,
            explanation=self._workload_explanation(level, pending, approved, group.employee_count),
            data_quality=quality,
        )

    def employee_risks(
        self,
        query: ForecastQuery,
        context: ForecastAccessContext,
    ) -> ForecastEmployeeRiskResponse:
        period, dataset, quality = self._load(query, context)
        employees = self._employee_risks(dataset, period)
        return ForecastEmployeeRiskResponse(
            success=True,
            period=period.label,
            generated_at=datetime.now(timezone.utc),
            employees=employees,
            data_quality=quality,
        )

    def _load(
        self,
        query: ForecastQuery,
        context: ForecastAccessContext,
    ) -> tuple[_ResolvedPeriod, ForecastDataset, ForecastDataQuality]:
        period = self._resolve_period(query)
        filters = ForecastDataFilters(
            company_id=query.company_id if query.company_id is not None else context.company_id,
            department_id=query.department_id,
            team_id=query.team_id,
            employee_id=query.employee_id,
            manager_id=context.manager_id,
        )
        history_start = period.start - timedelta(days=365)
        dataset = self.repository.load_dataset(
            history_start=history_start,
            forecast_end=period.end,
            filters=filters,
        )
        quality = self._data_quality(dataset, period)
        return period, dataset, quality

    @staticmethod
    def _resolve_period(query: ForecastQuery) -> _ResolvedPeriod:
        today = date.today()
        requested = (query.period or "next_30_days").strip().lower()
        if query.start_date or query.end_date:
            start = query.start_date or today + timedelta(days=1)
            end = query.end_date or start + timedelta(days=29)
            if start > end:
                raise ValueError("invalid_date_range")
            return _ResolvedPeriod(label="custom", start=start, end=end)

        start = today + timedelta(days=1)
        if requested == "next_week":
            end = start + timedelta(days=6)
        elif requested in {"next_month", "next_30_days"}:
            end = start + timedelta(days=29)
        elif requested == "next_90_days":
            end = start + timedelta(days=89)
        else:
            end = start + timedelta(days=29)
            requested = "next_30_days"
        return _ResolvedPeriod(label=requested, start=start, end=end)

    def _data_quality(self, dataset: ForecastDataset, period: _ResolvedPeriod) -> ForecastDataQuality:
        historical_days = self._historical_days(dataset, period.start)
        any_source_ok = any(dataset.source_ok.values())
        source = "database" if all(dataset.source_ok.values()) else "partial_database"
        if not any_source_ok:
            return ForecastDataQuality(
                status=ForecastDataQualityStatus.UNAVAILABLE,
                fallback_used=True,
                message="Sources de donnees indisponibles; aucune donnee fictive n'est retournee.",
                historical_days=0,
                source="unavailable",
            )
        if historical_days < 7:
            return ForecastDataQuality(
                status=ForecastDataQualityStatus.INSUFFICIENT_DATA,
                fallback_used=True,
                message="Historique insuffisant, prevision basee sur une moyenne mobile.",
                historical_days=historical_days,
                source=source,
            )
        if not (self.model and self.model.is_ready):
            return ForecastDataQuality(
                status=ForecastDataQualityStatus.OK,
                fallback_used=True,
                message="Modele non entraine, prevision basee sur les tendances historiques.",
                historical_days=historical_days,
                source=source,
            )
        return ForecastDataQuality(
            status=ForecastDataQualityStatus.OK,
            fallback_used=False,
            message=None,
            historical_days=historical_days,
            source=source,
        )

    @staticmethod
    def _historical_days(dataset: ForecastDataset, forecast_start: date) -> int:
        days: set[date] = set()
        for event in [*dataset.leave_events, *dataset.absence_events, *dataset.telework_events]:
            if not event.is_approved:
                continue
            for day in iter_dates(event.start_date, min(event.end_date, forecast_start - timedelta(days=1))):
                if day < forecast_start:
                    days.add(day)
        days.update(event.event_date for event in dataset.presence_events if event.event_date < forecast_start)
        return len(days)

    def _predict_group(
        self,
        dataset: ForecastDataset,
        period: _ResolvedPeriod,
        group: _GroupMeta,
        quality: ForecastDataQuality,
    ) -> _PredictionBundle:
        if group.employee_count <= 0:
            return _PredictionBundle(
                series=[
                    ForecastSeriesPoint(
                        date=day.isoformat(),
                        predicted_absences=0.0,
                        predicted_leaves=0.0,
                        predicted_presence_rate=100.0,
                    )
                    for day in iter_dates(period.start, period.end)
                ],
                risk=ForecastRiskLevel.LOW,
            )

        rows: list[ForecastFeatureRow] = []
        fallback_values: list[tuple[float, float, float, ForecastRiskLevel]] = []
        for day in iter_dates(period.start, period.end):
            row = self._feature_row(dataset, day, period.start, group)
            rows.append(row)
            fallback_values.append(self._fallback_values(dataset, day, period.start, group))

        use_model = (
            self.model is not None
            and self.model.is_ready
            and quality.status == ForecastDataQualityStatus.OK
            and not quality.fallback_used
        )
        model_values: list[tuple[float, float, float, ForecastRiskLevel]] | None = None
        if use_model:
            try:
                features = self.feature_builder.to_dataframe(rows)
                regression, risks = self.model.predict(features)
                model_values = []
                for idx, predicted in enumerate(regression):
                    raw = list(predicted) if hasattr(predicted, "__iter__") else [float(predicted)]
                    fallback_abs, fallback_leave, fallback_presence, fallback_risk = fallback_values[idx]
                    absences = max(0.0, float(raw[0]) if len(raw) > 0 else fallback_abs)
                    leaves = max(0.0, float(raw[1]) if len(raw) > 1 else fallback_leave)
                    presence = self._clamp(float(raw[2]) if len(raw) > 2 else fallback_presence, 0.0, 100.0)
                    risk_value = str(risks[idx]) if idx < len(risks) else fallback_risk.value
                    try:
                        risk = ForecastRiskLevel(risk_value)
                    except ValueError:
                        risk = ForecastRiskLevel(risk_from_metrics(absences, leaves, presence, group.employee_count))
                    model_values.append((absences, leaves, presence, risk))
            except Exception:
                logger.exception("forecast model prediction failed; using statistical fallback")
                quality.fallback_used = True
                quality.message = "Modele indisponible, prevision basee sur les tendances historiques."
                model_values = None

        selected = model_values or fallback_values
        series = [
            ForecastSeriesPoint(
                date=day.isoformat(),
                predicted_absences=round(absences, 2),
                predicted_leaves=round(leaves, 2),
                predicted_presence_rate=round(presence, 1),
            )
            for day, (absences, leaves, presence, _) in zip(iter_dates(period.start, period.end), selected)
        ]
        return _PredictionBundle(
            series=series,
            risk=self._max_risk([risk for _, _, _, risk in selected]),
        )

    def _feature_row(
        self,
        dataset: ForecastDataset,
        target_date: date,
        forecast_start: date,
        group: _GroupMeta,
    ) -> ForecastFeatureRow:
        recent_start = target_date - timedelta(days=30)
        previous_month_start = target_date - timedelta(days=60)
        previous_week_start = target_date - timedelta(days=14)
        recent_week_start = target_date - timedelta(days=7)
        employee_ids = group.employee_ids
        leave_balance = sum(dataset.leave_balances.get(employee_id, 0.0) for employee_id in employee_ids)
        average_balance = leave_balance / max(group.employee_count, 1)
        recent_absences = self._event_days(
            dataset.absence_events,
            recent_start,
            target_date - timedelta(days=1),
            employee_ids,
            approved_only=True,
        ) + self._presence_absence_days(dataset.presence_events, recent_start, target_date - timedelta(days=1), employee_ids)
        recent_leaves = self._event_days(
            dataset.leave_events,
            recent_start,
            target_date - timedelta(days=1),
            employee_ids,
            approved_only=True,
        )
        recent_lates = self._late_days(dataset.presence_events, recent_start, target_date - timedelta(days=1), employee_ids)
        recent_remote = self._event_days(
            dataset.telework_events,
            recent_start,
            target_date - timedelta(days=1),
            employee_ids,
            approved_only=True,
        ) + self._remote_days(dataset.presence_events, recent_start, target_date - timedelta(days=1), employee_ids)
        approved_requests = self._event_days(
            [*dataset.leave_events, *dataset.absence_events],
            target_date,
            target_date,
            employee_ids,
            approved_only=True,
        )
        pending_requests = self._event_days(
            [*dataset.leave_events, *dataset.absence_events, *dataset.telework_events],
            target_date,
            target_date,
            employee_ids,
            pending_only=True,
        )
        team_absence_rate = (recent_absences / max(group.employee_count * 30, 1)) * 100
        average_presence_rate = self._average_presence_rate(
            dataset.presence_events,
            recent_start,
            target_date - timedelta(days=1),
            employee_ids,
        )
        week_leave_recent = self._event_days(
            dataset.leave_events,
            recent_week_start,
            target_date - timedelta(days=1),
            employee_ids,
            approved_only=True,
        )
        week_leave_previous = self._event_days(
            dataset.leave_events,
            previous_week_start,
            recent_week_start - timedelta(days=1),
            employee_ids,
            approved_only=True,
        )
        month_abs_recent = recent_absences
        month_abs_previous = self._event_days(
            dataset.absence_events,
            previous_month_start,
            recent_start - timedelta(days=1),
            employee_ids,
            approved_only=True,
        ) + self._presence_absence_days(
            dataset.presence_events,
            previous_month_start,
            recent_start - timedelta(days=1),
            employee_ids,
        )
        return ForecastFeatureRow(
            target_date=target_date,
            employee_count=group.employee_count,
            department_id=group.department_id,
            team_id=group.team_id,
            leave_balance=average_balance,
            absence_count_last_30_days=float(recent_absences),
            leave_count_last_30_days=float(recent_leaves),
            late_count_last_30_days=float(recent_lates),
            remote_days_last_30_days=float(recent_remote),
            approved_leave_count=float(self._event_days(
                dataset.leave_events,
                target_date,
                target_date,
                employee_ids,
                approved_only=True,
            )),
            pending_leave_count=float(self._event_days(
                dataset.leave_events,
                target_date,
                target_date,
                employee_ids,
                pending_only=True,
            )),
            team_absence_rate=float(team_absence_rate),
            department_absence_rate=float(team_absence_rate),
            team_leave_count_last_week=float(week_leave_recent),
            department_leave_count_last_month=float(recent_leaves),
            average_presence_rate=float(average_presence_rate),
            pending_requests_count=float(pending_requests),
            approved_requests_count=float(approved_requests),
            weekly_leave_trend=float(week_leave_recent - week_leave_previous),
            monthly_absence_trend=float(month_abs_recent - month_abs_previous),
            holidays=frozenset(dataset.holidays),
        )

    def _fallback_values(
        self,
        dataset: ForecastDataset,
        target_date: date,
        forecast_start: date,
        group: _GroupMeta,
    ) -> tuple[float, float, float, ForecastRiskLevel]:
        history_start = forecast_start - timedelta(days=365)
        history_end = forecast_start - timedelta(days=1)
        abs_history = self._daily_history(
            dataset.absence_events,
            dataset.presence_events,
            history_start,
            history_end,
            group.employee_ids,
            include_presence_absences=True,
        )
        leave_history = self._daily_history(
            dataset.leave_events,
            [],
            history_start,
            history_end,
            group.employee_ids,
            include_presence_absences=False,
        )
        base_absences = self._weekday_average(abs_history, target_date)
        base_leaves = self._weekday_average(leave_history, target_date)
        known_absences = self._weighted_known_days(
            dataset.absence_events,
            target_date,
            group.employee_ids,
        )
        known_leaves = self._weighted_known_days(
            dataset.leave_events,
            target_date,
            group.employee_ids,
        )
        absences = max(base_absences, known_absences)
        leaves = max(base_leaves, known_leaves)
        presence_rate = self._clamp(
            100.0 - (((absences + leaves) / max(group.employee_count, 1)) * 100.0),
            0.0,
            100.0,
        )
        risk = ForecastRiskLevel(risk_from_metrics(absences, leaves, presence_rate, group.employee_count))
        return absences, leaves, presence_rate, risk

    @staticmethod
    def _daily_history(
        events: list[ForecastEvent],
        presence_events: Iterable[PresenceEvent],
        start: date,
        end: date,
        employee_ids: set[int],
        *,
        include_presence_absences: bool,
    ) -> dict[date, float]:
        daily: dict[date, set[int]] = defaultdict(set)
        for event in events:
            if event.employee_id not in employee_ids or not event.is_approved:
                continue
            for day in iter_dates(max(start, event.start_date), min(end, event.end_date)):
                daily[day].add(event.employee_id)
        if include_presence_absences:
            for event in presence_events:
                if event.employee_id in employee_ids and start <= event.event_date <= end and event.is_absent:
                    daily[event.event_date].add(event.employee_id)
        return {day: float(len(ids)) for day, ids in daily.items()}

    @staticmethod
    def _weekday_average(history: dict[date, float], target_date: date) -> float:
        if not history:
            return 0.0
        same_weekday = [count for day, count in history.items() if day.weekday() == target_date.weekday()]
        values = same_weekday or list(history.values())
        return float(mean(values)) if values else 0.0

    @staticmethod
    def _weighted_known_days(events: list[ForecastEvent], target_date: date, employee_ids: set[int]) -> float:
        employee_weights: dict[int, float] = {}
        for event in events:
            if event.employee_id not in employee_ids:
                continue
            if not (event.start_date <= target_date <= event.end_date):
                continue
            status = normalize_status(event.status)
            if status in APPROVED_STATUSES:
                employee_weights[event.employee_id] = max(employee_weights.get(event.employee_id, 0.0), 1.0)
            elif event.is_pending:
                employee_weights[event.employee_id] = max(employee_weights.get(event.employee_id, 0.0), 0.5)
        return float(sum(employee_weights.values()))

    @staticmethod
    def _event_days(
        events: list[ForecastEvent],
        start: date,
        end: date,
        employee_ids: set[int],
        *,
        approved_only: bool = False,
        pending_only: bool = False,
    ) -> int:
        if start > end:
            return 0
        daily: set[tuple[int, date]] = set()
        for event in events:
            if event.employee_id not in employee_ids:
                continue
            if approved_only and not event.is_approved:
                continue
            if pending_only and not event.is_pending:
                continue
            overlap_start = max(start, event.start_date)
            overlap_end = min(end, event.end_date)
            if overlap_start > overlap_end:
                continue
            for day in iter_dates(overlap_start, overlap_end):
                daily.add((event.employee_id, day))
        return len(daily)

    @staticmethod
    def _presence_absence_days(
        events: list[PresenceEvent],
        start: date,
        end: date,
        employee_ids: set[int],
    ) -> int:
        if start > end:
            return 0
        return len({
            (event.employee_id, event.event_date)
            for event in events
            if event.employee_id in employee_ids and start <= event.event_date <= end and event.is_absent
        })

    @staticmethod
    def _late_days(events: list[PresenceEvent], start: date, end: date, employee_ids: set[int]) -> int:
        if start > end:
            return 0
        return len({
            (event.employee_id, event.event_date)
            for event in events
            if event.employee_id in employee_ids and start <= event.event_date <= end and event.late_arrival
        })

    @staticmethod
    def _remote_days(events: list[PresenceEvent], start: date, end: date, employee_ids: set[int]) -> int:
        if start > end:
            return 0
        return len({
            (event.employee_id, event.event_date)
            for event in events
            if event.employee_id in employee_ids and start <= event.event_date <= end and event.is_remote
        })

    @staticmethod
    def _average_presence_rate(
        events: list[PresenceEvent],
        start: date,
        end: date,
        employee_ids: set[int],
    ) -> float:
        scoped = [
            event
            for event in events
            if event.employee_id in employee_ids and start <= event.event_date <= end
        ]
        if not scoped:
            return 100.0
        present = sum(1 for event in scoped if not event.is_absent)
        return (present / max(len(scoped), 1)) * 100.0

    def _team_predictions(
        self,
        dataset: ForecastDataset,
        period: _ResolvedPeriod,
        quality: ForecastDataQuality,
    ) -> list[ForecastTeamPrediction]:
        teams = self._team_groups(dataset)
        predictions: list[ForecastTeamPrediction] = []
        for group in teams:
            bundle = self._predict_group(dataset, period, group, quality)
            summary = self._summary(bundle.series, group.employee_count)
            explanation = self._team_explanation(group, summary)
            predictions.append(
                ForecastTeamPrediction(
                    team_id=group.team_id,
                    team_name=group.team_name,
                    department_id=group.department_id,
                    department_name=group.department_name,
                    predicted_absences=summary.predicted_absences,
                    predicted_leaves=summary.predicted_leaves,
                    predicted_presence_rate=summary.predicted_presence_rate,
                    risk_level=bundle.risk,
                    explanation=explanation,
                )
            )
        return sorted(
            predictions,
            key=lambda item: (
                self._risk_rank(item.risk_level),
                item.predicted_absences + item.predicted_leaves,
            ),
            reverse=True,
        )

    def _team_groups(self, dataset: ForecastDataset) -> list[_GroupMeta]:
        if dataset.employees:
            by_team: dict[int | None, list] = defaultdict(list)
            for employee in dataset.employees:
                by_team[employee.team_id].append(employee)
            groups = []
            for team_id, employees in by_team.items():
                first = employees[0]
                groups.append(
                    _GroupMeta(
                        employee_ids={employee.employee_id for employee in employees},
                        employee_count=len(employees),
                        team_id=team_id,
                        team_name=first.team_name or first.department_name or "Non assigne",
                        department_id=first.department_id,
                        department_name=first.department_name,
                    )
                )
            return groups

        event_groups: dict[int | None, set[int]] = defaultdict(set)
        for event in [*dataset.leave_events, *dataset.absence_events, *dataset.telework_events]:
            event_groups[event.team_id].add(event.employee_id)
        for event in dataset.presence_events:
            event_groups[event.team_id].add(event.employee_id)
        return [
            _GroupMeta(
                employee_ids=ids,
                employee_count=len(ids),
                team_id=team_id,
                team_name="Non assigne",
            )
            for team_id, ids in event_groups.items()
        ]

    def _overall_group(self, dataset: ForecastDataset) -> _GroupMeta:
        employee_ids = dataset.employee_ids()
        employee_count = len(dataset.employees) if dataset.employees else len(employee_ids)
        return _GroupMeta(employee_ids=employee_ids, employee_count=employee_count)

    @staticmethod
    def _summary(series: list[ForecastSeriesPoint], employee_count: int) -> ForecastSummary:
        total_absences = sum(point.predicted_absences for point in series)
        total_leaves = sum(point.predicted_leaves for point in series)
        presence = mean([point.predicted_presence_rate for point in series]) if series else 100.0
        days = max(len(series), 1)
        risk = ForecastRiskLevel(risk_from_metrics(total_absences / days, total_leaves / days, presence, employee_count))
        return ForecastSummary(
            predicted_absences=round(total_absences, 2),
            predicted_leaves=round(total_leaves, 2),
            predicted_presence_rate=round(presence, 1),
            risk_level=risk,
        )

    @staticmethod
    def _max_risk(risks: Iterable[ForecastRiskLevel]) -> ForecastRiskLevel:
        ordered = sorted(risks, key=ForecastService._risk_rank, reverse=True)
        return ordered[0] if ordered else ForecastRiskLevel.LOW

    @staticmethod
    def _risk_rank(risk: ForecastRiskLevel) -> int:
        return {
            ForecastRiskLevel.LOW: 1,
            ForecastRiskLevel.MEDIUM: 2,
            ForecastRiskLevel.HIGH: 3,
            ForecastRiskLevel.CRITICAL: 4,
        }.get(risk, 0)

    def _request_counts(self, dataset: ForecastDataset, period: _ResolvedPeriod) -> tuple[int, int]:
        pending: set[tuple[str, int | None, int, date, date]] = set()
        approved: set[tuple[str, int | None, int, date, date]] = set()
        for event in [*dataset.leave_events, *dataset.absence_events, *dataset.telework_events]:
            if event.end_date < period.start or event.start_date > period.end:
                continue
            key = (event.event_type, event.request_id, event.employee_id, event.start_date, event.end_date)
            if event.is_pending:
                pending.add(key)
            elif event.is_approved:
                approved.add(key)
        return len(pending), len(approved)

    def _workload_level(
        self,
        dataset: ForecastDataset,
        period: _ResolvedPeriod,
        employee_count: int,
    ) -> ForecastWorkloadLevel:
        pending, approved = self._request_counts(dataset, period)
        ratio = pending / max(employee_count, 1)
        if pending >= 25 or ratio >= 0.35:
            return ForecastWorkloadLevel.CRITICAL
        if pending >= 12 or ratio >= 0.20:
            return ForecastWorkloadLevel.HIGH
        if pending >= 5 or ratio >= 0.08:
            return ForecastWorkloadLevel.MEDIUM
        return ForecastWorkloadLevel.LOW

    @staticmethod
    def _workload_explanation(
        level: ForecastWorkloadLevel,
        pending: int,
        approved: int,
        employee_count: int,
    ) -> str:
        return (
            f"{pending} demandes en attente et {approved} demandes deja approuvees "
            f"pour {employee_count} salaries dans le perimetre."
        )

    def _employee_risks(self, dataset: ForecastDataset, period: _ResolvedPeriod) -> list[ForecastEmployeeRisk]:
        profiles = {employee.employee_id: employee for employee in dataset.employees}
        ids = dataset.employee_ids()
        recent_start = period.start - timedelta(days=30)
        risks: list[ForecastEmployeeRisk] = []
        for employee_id in ids:
            profile = profiles.get(employee_id)
            scoped_ids = {employee_id}
            absences = self._event_days(
                dataset.absence_events,
                recent_start,
                period.start - timedelta(days=1),
                scoped_ids,
                approved_only=True,
            ) + self._presence_absence_days(
                dataset.presence_events,
                recent_start,
                period.start - timedelta(days=1),
                scoped_ids,
            )
            leaves = self._event_days(
                dataset.leave_events,
                recent_start,
                period.start - timedelta(days=1),
                scoped_ids,
                approved_only=True,
            )
            lates = self._late_days(dataset.presence_events, recent_start, period.start - timedelta(days=1), scoped_ids)
            planned = self._event_days(dataset.leave_events, period.start, period.end, scoped_ids, approved_only=True)
            score = self._clamp((absences * 0.14) + (lates * 0.04) + (leaves * 0.02) + (planned * 0.03), 0.0, 1.0)
            risk = self._risk_from_score(score)
            name = profile.employee_name if profile else f"Employe #{employee_id}"
            risks.append(
                ForecastEmployeeRisk(
                    employee_id=employee_id,
                    employee_name=name,
                    team_id=profile.team_id if profile else None,
                    team_name=profile.team_name if profile else None,
                    department_id=profile.department_id if profile else None,
                    department_name=profile.department_name if profile else None,
                    absence_count_last_30_days=absences,
                    leave_count_last_30_days=leaves,
                    late_count_last_30_days=lates,
                    planned_leave_days=planned,
                    risk_level=risk,
                    score=round(score, 3),
                    explanation=(
                        f"{absences} jours d'absence, {leaves} jours de conge et "
                        f"{lates} retards observes sur 30 jours."
                    ),
                )
            )
        return sorted(risks, key=lambda item: (self._risk_rank(item.risk_level), item.score), reverse=True)

    @staticmethod
    def _risk_from_score(score: float) -> ForecastRiskLevel:
        if score >= 0.75:
            return ForecastRiskLevel.CRITICAL
        if score >= 0.50:
            return ForecastRiskLevel.HIGH
        if score >= 0.25:
            return ForecastRiskLevel.MEDIUM
        return ForecastRiskLevel.LOW

    @staticmethod
    def _team_explanation(group: _GroupMeta, summary: ForecastSummary) -> str:
        return (
            f"{group.team_name}: {summary.predicted_absences:.1f} absences et "
            f"{summary.predicted_leaves:.1f} jours de conge prevus, "
            f"presence moyenne {summary.predicted_presence_rate:.1f}%."
        )

    @staticmethod
    def _dashboard_explanations(
        dataset: ForecastDataset,
        quality: ForecastDataQuality,
        employee_count: int,
        teams: list[ForecastTeamPrediction],
    ) -> list[str]:
        explanations = [
            f"Perimetre analyse: {employee_count} salaries, {len(teams)} equipes.",
        ]
        if quality.message:
            explanations.append(quality.message)
        if dataset.warnings:
            warnings = ", ".join(sorted(set(dataset.warnings)))
            explanations.append(f"Sources partielles: {warnings}.")
        high_teams = [team.team_name for team in teams if team.risk_level in {ForecastRiskLevel.HIGH, ForecastRiskLevel.CRITICAL}]
        if high_teams:
            explanations.append(f"Equipes a surveiller: {', '.join(high_teams[:3])}.")
        return explanations

    @staticmethod
    def _clamp(value: float, lower: float, upper: float) -> float:
        return max(lower, min(upper, value))


_forecast_service: ForecastService | None = None


def get_forecast_service() -> ForecastService:
    global _forecast_service
    if _forecast_service is None:
        _forecast_service = ForecastService()
    return _forecast_service
