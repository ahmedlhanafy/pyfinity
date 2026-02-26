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


class CarrierInfinityDevice:
    """Carrier Infinity Touch thermostat interface."""

    def __init__(self, bus: SerialBus):
        self.bus = bus

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

    def get_status(self) -> dict:
        """Read indoor/outdoor temps and setpoints."""
        data = self.bus.read_table(HEATPUMP, "000304")
        indoor = data[10] if data and len(data) > 10 else None

        data = self.bus.read_table(TSTAT, "004901")
        outdoor = data[16] if data and len(data) > 16 else None

        profile = self.read_comfort_profile()
        heat_sp = profile[HEAT_SETPOINT_BYTE] if profile else None
        cool_sp = profile[COOL_SETPOINT_BYTE] if profile else None

        return {
            "indoor_temp": indoor,
            "outdoor_temp": outdoor,
            "heat_setpoint": heat_sp,
            "cool_setpoint": cool_sp,
        }

    def get_daily_energy(self) -> list[dict]:
        """Read daily energy usage from table 00460e (10-byte records)."""
        data = self.bus.read_table(TSTAT, "00460e")
        if not data:
            return []
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
        return days

    def get_yearly_energy(self) -> dict | None:
        """Read yearly energy totals from table 004610."""
        data = self.bus.read_table(TSTAT, "004610")
        if not data or len(data) < 37:
            return None

        def u16(d, offset):
            return struct.unpack(">H", d[offset : offset + 2])[0] if offset + 2 <= len(d) else 0

        return {
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
