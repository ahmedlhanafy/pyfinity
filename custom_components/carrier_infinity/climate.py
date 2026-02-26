"""Climate entity for Carrier Infinity Touch thermostat."""

import logging

from homeassistant.components.climate import (
    ClimateEntity,
    ClimateEntityFeature,
    HVACMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_TEMPERATURE, UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from carrier_infinity_lib.const import (
    COOL_MAX,
    COOL_MIN,
    COOL_SETPOINT_BYTE,
    HEAT_MAX,
    HEAT_MIN,
    HEAT_SETPOINT_BYTE,
)

from .const import DOMAIN
from .coordinator import CarrierInfinityCoordinator

_LOGGER = logging.getLogger(__name__)

ATTR_TARGET_TEMP_LOW = "target_temp_low"
ATTR_TARGET_TEMP_HIGH = "target_temp_high"


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up climate entity from config entry."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([CarrierInfinityClimate(coordinator)])


class CarrierInfinityClimate(CoordinatorEntity, ClimateEntity):
    """Carrier Infinity Touch thermostat climate entity."""

    _attr_has_entity_name = True
    _attr_name = None  # Use device name
    _attr_temperature_unit = UnitOfTemperature.FAHRENHEIT
    _attr_supported_features = (
        ClimateEntityFeature.TARGET_TEMPERATURE
        | ClimateEntityFeature.TARGET_TEMPERATURE_RANGE
    )
    _attr_hvac_modes = [HVACMode.HEAT, HVACMode.COOL, HVACMode.HEAT_COOL]
    _attr_min_temp = HEAT_MIN
    _attr_max_temp = COOL_MAX

    def __init__(self, coordinator: CarrierInfinityCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{coordinator.device.bus.port}_climate"
        # Default to heat_cool (dual setpoint) since we can't detect mode from bus
        self._hvac_mode = HVACMode.HEAT_COOL
        # Optimistic setpoint tracking
        self._optimistic_heat: int | None = None
        self._optimistic_cool: int | None = None

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self.coordinator.device.bus.port)},
            "name": "Carrier Infinity Touch",
            "manufacturer": "Carrier",
            "model": "SYSTXCCITN01",
        }

    @property
    def hvac_mode(self) -> HVACMode:
        return self._hvac_mode

    @property
    def current_temperature(self) -> float | None:
        status = self.coordinator.data.get("status", {})
        return status.get("indoor_temp")

    @property
    def target_temperature(self) -> float | None:
        """Single setpoint for HEAT or COOL mode."""
        if self._hvac_mode == HVACMode.HEAT:
            return self._effective_heat_setpoint
        if self._hvac_mode == HVACMode.COOL:
            return self._effective_cool_setpoint
        return None

    @property
    def target_temperature_low(self) -> float | None:
        """Heat setpoint in HEAT_COOL mode."""
        if self._hvac_mode == HVACMode.HEAT_COOL:
            return self._effective_heat_setpoint
        return None

    @property
    def target_temperature_high(self) -> float | None:
        """Cool setpoint in HEAT_COOL mode."""
        if self._hvac_mode == HVACMode.HEAT_COOL:
            return self._effective_cool_setpoint
        return None

    @property
    def _effective_heat_setpoint(self) -> int | None:
        if self._optimistic_heat is not None:
            return self._optimistic_heat
        status = self.coordinator.data.get("status", {})
        return status.get("heat_setpoint")

    @property
    def _effective_cool_setpoint(self) -> int | None:
        if self._optimistic_cool is not None:
            return self._optimistic_cool
        status = self.coordinator.data.get("status", {})
        return status.get("cool_setpoint")

    async def async_set_hvac_mode(self, hvac_mode: HVACMode) -> None:
        """Set HVAC mode (local only - cannot write mode to bus)."""
        self._hvac_mode = hvac_mode
        self.async_write_ha_state()

    async def async_set_temperature(self, **kwargs) -> None:
        """Set temperature. Dispatches ~30s write to background thread."""
        if self._hvac_mode == HVACMode.HEAT_COOL:
            # Range mode
            low = kwargs.get(ATTR_TARGET_TEMP_LOW)
            high = kwargs.get(ATTR_TARGET_TEMP_HIGH)
            if low is not None:
                await self._async_write_setpoint(
                    int(low), HEAT_SETPOINT_BYTE, "heat"
                )
            if high is not None:
                await self._async_write_setpoint(
                    int(high), COOL_SETPOINT_BYTE, "cool"
                )
        else:
            # Single setpoint mode
            temp = kwargs.get(ATTR_TEMPERATURE)
            if temp is not None:
                if self._hvac_mode == HVACMode.HEAT:
                    await self._async_write_setpoint(
                        int(temp), HEAT_SETPOINT_BYTE, "heat"
                    )
                elif self._hvac_mode == HVACMode.COOL:
                    await self._async_write_setpoint(
                        int(temp), COOL_SETPOINT_BYTE, "cool"
                    )

    async def _async_write_setpoint(
        self, target: int, byte_offset: int, which: str
    ) -> None:
        """Optimistic update + background write."""
        # Optimistic: update UI immediately
        if which == "heat":
            self._optimistic_heat = target
        else:
            self._optimistic_cool = target
        self.async_write_ha_state()

        # Background write (~30s, doesn't block event loop)
        self.hass.async_create_task(
            self._async_do_write(target, byte_offset, which)
        )

    async def _async_do_write(
        self, target: int, byte_offset: int, which: str
    ) -> None:
        """Execute the blocking setpoint write in executor, then refresh."""
        success = await self.hass.async_add_executor_job(
            self.coordinator.device.set_setpoint, target, byte_offset
        )
        # Clear optimistic value
        if which == "heat":
            self._optimistic_heat = None
        else:
            self._optimistic_cool = None

        if not success:
            _LOGGER.warning("Failed to set %s setpoint to %d°F", which, target)

        # Refresh from bus to get actual values
        await self.coordinator.async_request_refresh()
