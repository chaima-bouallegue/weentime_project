from __future__ import annotations

from typing import Literal


ProviderMode = Literal["disabled", "ollama", "cloud"]
ProviderStatus = Literal["disabled", "available", "unavailable", "error"]

SUPPORTED_PROVIDER_MODES: set[str] = {"disabled", "ollama", "cloud"}
