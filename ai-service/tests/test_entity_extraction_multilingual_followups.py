from __future__ import annotations

from core.entity_extractor import extract_entities


def test_tunisian_ghodwa_maps_to_tomorrow_for_leave_followup() -> None:
    entities = extract_entities("ghodwa", intent="CREATE_LEAVE", role="EMPLOYEE", pending_intent="CREATE_LEAVE")

    assert entities["start_date"] == entities["end_date"]
    assert entities["date_precision"] == "relative"


def test_baad_ghodwa_maps_to_after_tomorrow() -> None:
    tomorrow = extract_entities("ghodwa", intent="CREATE_LEAVE", role="EMPLOYEE")
    after = extract_entities("baad ghodwa", intent="CREATE_LEAVE", role="EMPLOYEE")

    assert after["start_date"] != tomorrow["start_date"]
    assert after["date_precision"] == "relative"


def test_authorization_time_range_is_extracted_from_followup() -> None:
    entities = extract_entities("pour demain de 10h a 11h", intent="CREATE_AUTORISATION", role="EMPLOYEE")

    assert entities["request_date"]
    assert entities["time_start"] == "10:00:00"
    assert entities["time_end"] == "11:00:00"
    assert entities["reason"] is None


def test_authorization_duration_without_start_is_extracted() -> None:
    entities = extract_entities("pour demain 1h", intent="CREATE_AUTORISATION", role="EMPLOYEE")

    assert entities["request_date"]
    assert entities["duration_hours"] == 1.0
    assert entities["time_start"] is None
    assert entities["reason"] is None


def test_leave_direct_tunisian_sick_leave_extracts_date_and_type_without_fake_reason() -> None:
    entities = extract_entities("nheb conge ghodwa de maladie", intent="CREATE_LEAVE", role="EMPLOYEE")

    assert entities["start_date"]
    assert entities["leave_type_label"] == "Conge maladie"
    assert entities["reason"] is None
