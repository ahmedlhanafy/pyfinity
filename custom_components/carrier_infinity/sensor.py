"""Sensor entities for Carrier Infinity Touch (temps + energy)."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy, UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.typing import StateType
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import CarrierInfinityCoordinator


@dataclass(frozen=True, kw_only=True)
class CarrierSensorDescription(SensorEntityDescription):
    """Describes a Carrier Infinity sensor."""

    value_fn: Callable[[dict], StateType]


def _daily_value(key: str) -> Callable[[dict], StateType]:
    """Extract yesterday's daily energy value."""

    def _extract(data: dict) -> StateType:
        days = data.get("daily_energy", [])
        if days:
            return days[0].get(key)
        return None

    return _extract


def _daily_total(data: dict) -> StateType:
    """Sum all yesterday's energy categories."""
    days = data.get("daily_energy", [])
    if days:
        d = days[0]
        return d["hp_heat"] + d["cooling"] + d["elec_heat"] + d["fan"] + d["reheat"]
    return None


def _yearly_value(year: str, key: str) -> Callable[[dict], StateType]:
    """Extract yearly energy value."""

    def _extract(data: dict) -> StateType:
        yearly = data.get("yearly_energy")
        if yearly and year in yearly:
            return yearly[year].get(key)
        return None

    return _extract


TEMPERATURE_SENSORS: tuple[CarrierSensorDescription, ...] = (
    CarrierSensorDescription(
        key="indoor_temp",
        translation_key="indoor_temp",
        name="Indoor Temperature",
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTemperature.FAHRENHEIT,
        value_fn=lambda data: data.get("status", {}).get("indoor_temp"),
    ),
    CarrierSensorDescription(
        key="outdoor_temp",
        translation_key="outdoor_temp",
        name="Outdoor Temperature",
        device_class=SensorDeviceClass.TEMPERATURE,
        state_class=SensorStateClass.MEASUREMENT,
        native_unit_of_measurement=UnitOfTemperature.FAHRENHEIT,
        value_fn=lambda data: data.get("status", {}).get("outdoor_temp"),
    ),
)

DAILY_ENERGY_SENSORS: tuple[CarrierSensorDescription, ...] = (
    CarrierSensorDescription(
        key="daily_hp_heat",
        translation_key="daily_hp_heat",
        name="HP Heat (Yesterday)",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_daily_value("hp_heat"),
    ),
    CarrierSensorDescription(
        key="daily_cooling",
        translation_key="daily_cooling",
        name="Cooling (Yesterday)",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_daily_value("cooling"),
    ),
    CarrierSensorDescription(
        key="daily_elec_heat",
        translation_key="daily_elec_heat",
        name="Electric Heat (Yesterday)",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_daily_value("elec_heat"),
    ),
    CarrierSensorDescription(
        key="daily_fan",
        translation_key="daily_fan",
        name="Fan (Yesterday)",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_daily_value("fan"),
    ),
    CarrierSensorDescription(
        key="daily_total",
        translation_key="daily_total",
        name="Total Energy (Yesterday)",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_daily_total,
    ),
)

YEARLY_ENERGY_SENSORS: tuple[CarrierSensorDescription, ...] = (
    CarrierSensorDescription(
        key="ytd_hp_heat",
        translation_key="ytd_hp_heat",
        name="YTD HP Heat",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_yearly_value("current", "hp_heat"),
    ),
    CarrierSensorDescription(
        key="ytd_elec_heat",
        translation_key="ytd_elec_heat",
        name="YTD Electric Heat",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_yearly_value("current", "elec_heat"),
    ),
    CarrierSensorDescription(
        key="ytd_cooling",
        translation_key="ytd_cooling",
        name="YTD Cooling",
        device_class=SensorDeviceClass.ENERGY,
        state_class=SensorStateClass.TOTAL_INCREASING,
        native_unit_of_measurement=UnitOfEnergy.KILO_WATT_HOUR,
        value_fn=_yearly_value("current", "cooling"),
    ),
)

ALL_SENSORS = TEMPERATURE_SENSORS + DAILY_ENERGY_SENSORS + YEARLY_ENERGY_SENSORS


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up sensor entities from config entry."""
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        CarrierInfinitySensor(coordinator, desc) for desc in ALL_SENSORS
    )


class CarrierInfinitySensor(CoordinatorEntity, SensorEntity):
    """Carrier Infinity Touch sensor."""

    _attr_has_entity_name = True
    entity_description: CarrierSensorDescription

    def __init__(
        self,
        coordinator: CarrierInfinityCoordinator,
        description: CarrierSensorDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_unique_id = f"{coordinator.device.bus.port}_{description.key}"

    @property
    def device_info(self):
        return {
            "identifiers": {(DOMAIN, self.coordinator.device.bus.port)},
            "name": "Carrier Infinity Touch",
            "manufacturer": "Carrier",
            "model": "SYSTXCCITN01",
        }

    @property
    def native_value(self) -> StateType:
        if self.coordinator.data is None:
            return None
        return self.entity_description.value_fn(self.coordinator.data)
