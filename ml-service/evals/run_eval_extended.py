"""One-off: run attendance_anomaly_eval on the extended fixture only."""
import json
import logging
from pathlib import Path

from evals import attendance_anomaly_eval as mod

ROOT = Path(__file__).resolve().parents[1]
mod.DATASET_NAME = "attendance_anomaly_eval_extended"
mod.FIXTURE_PATH = ROOT / "tests" / "fixtures" / "attendance_anomaly_eval_extended.csv"

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = mod.run(force_local=False, publish=True)
    print(json.dumps(result, ensure_ascii=True, indent=2))