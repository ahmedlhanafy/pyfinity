"""High-level Carrier Infinity device operations."""

import logging
import struct
import time

from .const import (
    COOL_SETPOINT_BYTE,
    HEAT_SETPOINT_BYTE,
    HEATPUMP,
    TSTAT,
    WRITE_INTERVAL,
    WRITE_ROUNDS,
)
from .serial_bus import SerialBus

_LOGGER = logging.getLogger(__name__)


def _valid_temp(v):
    """Return True if v is a plausible temperature reading (not None, not 0)."""
    return v is not None and v != 0


class CarrierInfinityDevice:
    """Carrier Infinity Touch thermostat interface."""

    def __init__(self, bus: SerialBus):
        self.bus = bus
        # Cache last known good values so flaky reads don't blank the UI
        self._cache = {
            "indoor_temp": None,
            "outdoor_temp": None,
            "heat_setpoint": None,
            "cool_setpoint": None,
        }
        self._daily_cache: list[dict] = []
        self._yearly_cache: dict | None = None

    def read_comfort_profile(self) -> bytes | None:
        """Read table 00400a with retry."""
        for _ in range(3):
            try:
                data = self.bus.read_table(TSTAT, "00400a")
                if data and len(data) > COOL_SETPOINT_BYTE:
                    return data
            except OSError:
                pass
            time.sleep(0.5)
        return None

    def _read_or_cache(self, key: str, value):
        """Update cache if value is valid, return cached value either way."""
        if _valid_temp(value):
            self._cache[key] = value
        return self._cache[key]

    def get_status(self) -> dict:
        """Read indoor/outdoor temps and setpoints.

        Indoor: primary TS 004907[60], fallback HP 000304[10]
        Outdoor: primary HP 00061f[32], fallback TS 004901[16]
        Both sources can be flaky so we try primary first, fall back if None.
        Returns cached values when fresh reads fail.
        """
        # Indoor: thermostat table is more accurate
        data = self.bus.read_table(TSTAT, "004907")
        indoor = data[60] if data and len(data) > 60 else None
        if not _valid_temp(indoor):
            data = self.bus.read_table(HEATPUMP, "000304")
            indoor = data[10] if data and len(data) > 10 else None

        # Outdoor: heat pump sensor is fresher than thermostat cache
        data = self.bus.read_table(HEATPUMP, "00061f")
        outdoor = data[32] if data and len(data) > 32 else None
        if not _valid_temp(outdoor):
            data = self.bus.read_table(TSTAT, "004901")
            outdoor = data[16] if data and len(data) > 16 else None

        profile = self.read_comfort_profile()
        heat_sp = profile[HEAT_SETPOINT_BYTE] if profile else None
        cool_sp = profile[COOL_SETPOINT_BYTE] if profile else None

        return {
            "indoor_temp": self._read_or_cache("indoor_temp", indoor),
            "outdoor_temp": self._read_or_cache("outdoor_temp", outdoor),
            "heat_setpoint": self._read_or_cache("heat_setpoint", heat_sp),
            "cool_setpoint": self._read_or_cache("cool_setpoint", cool_sp),
        }

    def get_daily_energy(self) -> list[dict]:
        """Read daily energy usage from table 00460e (10-byte records)."""
        data = self.bus.read_table(TSTAT, "00460e")
        if not data:
            return self._daily_cache
        days = []
        for i in range(len(data) // 10):
            r = data[i * 10 : (i + 1) * 10]
            days.append({
                "hp_heat": r[0],
                "cooling": r[1],
                "elec_heat": r[2],
                "fan": r[3],
                "reheat": r[4],
            })
        if days:
            self._daily_cache = days
        return self._daily_cache

    def get_yearly_energy(self) -> dict | None:
        """Read yearly energy totals from table 004610."""
        data = self.bus.read_table(TSTAT, "004610")
        if not data or len(data) < 37:
            return self._yearly_cache

        def u16(d, offset):
            return struct.unpack(">H", d[offset : offset + 2])[0] if offset + 2 <= len(d) else 0

        result = {
            "current": {
                "hp_heat": u16(data, 3),
                "elec_heat": u16(data, 7),
                "cooling": u16(data, 11),
            },
            "previous": {
                "cooling": u16(data, 19),
                "hp_heat": u16(data, 23),
                "elec_heat": u16(data, 27),
                "fan": u16(data, 35),
            },
        }
        self._yearly_cache = result
        return self._yearly_cache

    def set_setpoint(self, target: int, byte_offset: int) -> bool:
        """Set a setpoint by writing to 00400a. Blocks ~30s (6 rounds x 5s)."""
        profile = self.read_comfort_profile()
        if not profile:
            _LOGGER.error("Could not read current setpoints")
            return False

        current = profile[byte_offset]
        if current == target:
            return True

        _LOGGER.info("Setting setpoint byte[%d]: %d -> %d", byte_offset, current, target)

        for round_num in range(WRITE_ROUNDS):
            try:
                data = self.bus.read_table(TSTAT, "00400a")
                if data:
                    modified = bytearray(data)
                    for i in range(len(modified)):
                        if modified[i] == current:
                            modified[i] = target
                    self.bus.write_table(TSTAT, "00400a", bytes(modified))
            except OSError as err:
                _LOGGER.warning("Write round %d failed: %s", round_num + 1, err)
            time.sleep(WRITE_INTERVAL)

        # Verify
        profile = self.read_comfort_profile()
        final = profile[byte_offset] if profile else None
        success = final == target
        if success:
            _LOGGER.info("Setpoint confirmed: %d°F", target)
        else:
            _LOGGER.warning("Setpoint verification: got %s, expected %d", final, target)
        return success
