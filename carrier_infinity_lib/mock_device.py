"""Mock device for development without RS-485 adapter."""

import random
import time


class MockDevice:
    """Drop-in replacement for CarrierInfinityDevice with fake data."""

    def __init__(self):
        self._heat_sp = 68
        self._cool_sp = 75
        self._indoor = 68
        self._outdoor = 45

    def get_status(self) -> dict:
        # Slight variation each poll
        self._indoor = max(60, min(80, self._indoor + random.choice([-1, 0, 0, 0, 1])))
        self._outdoor = max(20, min(90, self._outdoor + random.choice([-1, 0, 0, 0, 1])))
        return {
            "indoor_temp": self._indoor,
            "outdoor_temp": self._outdoor,
            "heat_setpoint": self._heat_sp,
            "cool_setpoint": self._cool_sp,
        }

    def get_daily_energy(self) -> list[dict]:
        return [
            {"hp_heat": 17, "cooling": 0, "elec_heat": 10, "fan": 1, "reheat": 0},
            {"hp_heat": 25, "cooling": 0, "elec_heat": 18, "fan": 2, "reheat": 0},
            {"hp_heat": 20, "cooling": 0, "elec_heat": 12, "fan": 1, "reheat": 0},
            {"hp_heat": 22, "cooling": 1, "elec_heat": 15, "fan": 1, "reheat": 0},
            {"hp_heat": 19, "cooling": 0, "elec_heat": 11, "fan": 1, "reheat": 0},
            {"hp_heat": 16, "cooling": 0, "elec_heat": 9, "fan": 1, "reheat": 0},
            {"hp_heat": 23, "cooling": 0, "elec_heat": 14, "fan": 2, "reheat": 0},
        ]

    def get_yearly_energy(self) -> dict:
        return {
            "current": {"hp_heat": 362, "elec_heat": 7343, "cooling": 0},
            "previous": {"cooling": 527, "hp_heat": 2637, "elec_heat": 3931, "fan": 15},
        }

    def set_setpoint(self, target: int, byte_offset: int) -> bool:
        from .const import HEAT_SETPOINT_BYTE
        time.sleep(2)  # Simulate brief delay (vs 30s real)
        if byte_offset == HEAT_SETPOINT_BYTE:
            self._heat_sp = target
        else:
            self._cool_sp = target
        return True
