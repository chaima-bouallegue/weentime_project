"""Real-data attendance anomaly training pipeline tests."""
from __future__ import annotations

from datetime import date, datetime, timedelta

import pandas as pd

from app.training.pipelines import train_attendance_anomaly


def _real_frame(rows: int = 40) -> pd.DataFrame:
    start = date(2026, 4, 1)
    data = []
    for index in range(rows):
        day = start + timedelta(days=index)
        check_in = datetime.combine(day, datetime.min.time()).replace(hour=9)
        check_out = check_in + timedelta(hours=8)
        data.append(
            {
                "employee_id": (index % 4) + 1,
                "employee_name": f"Employee {(index % 4) + 1}",
                "date": day,
                "check_in": check_in,
                "check_out": check_out,
                "duration_seconds": 8 * 3600,
                "expected_minutes": 480,
                "worked_minutes": 480,
                "overtime_minutes": 0,
                "daily_status": "IDLE",
                "late_arrival": False,
                "source": "WEB",
                "localisation": None,
            }
        )
    return pd.DataFrame(data)


def test_default_training_uses_real_postgresql_rows(monkeypatch, tmp_path):
    settings = train_attendance_anomaly.get_settings()
    monkeypatch.setattr(settings, "min_real_training_records", 30)
    monkeypatch.setattr(settings, "model_dir", str(tmp_path))
    monkeypatch.setattr(
        train_attendance_anomaly,
        "load_real_attendance_data",
        lambda: _real_frame(),
    )

    result = train_attendance_anomaly.train_pipeline()

    assert result.records_used == 40
    assert result.data_source == "postgresql:attendance_sessions"
    assert result.bundle_path.endswith(".joblib")
