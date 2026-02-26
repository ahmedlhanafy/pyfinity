"""DataUpdateCoordinator for Carrier Infinity Touch."""

import logging
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from carrier_infinity_lib.device import CarrierInfinityDevice

_LOGGER = logging.getLogger(__name__)


class CarrierInfinityCoordinator(DataUpdateCoordinator):
    """Polls the RS-485 bus and caches thermostat data."""

    def __init__(
        self, hass: HomeAssistant, device: CarrierInfinityDevice, scan_interval: int
    ):
        super().__init__(
            hass,
            _LOGGER,
            name="carrier_infinity",
            update_interval=timedelta(seconds=scan_interval),
        )
        self.device = device

    async def _async_update_data(self) -> dict:
        """Fetch data from bus in executor thread."""
        try:
            return await self.hass.async_add_executor_job(self._fetch_data)
        except Exception as err:
            raise UpdateFailed(f"Error reading from bus: {err}") from err

    def _fetch_data(self) -> dict:
        """Blocking data fetch (runs in thread pool). SerialBus._lock handles contention."""
        status = self.device.get_status()
        daily_energy = self.device.get_daily_energy()
        yearly_energy = self.device.get_yearly_energy()
        return {
            "status": status,
            "daily_energy": daily_energy,
            "yearly_energy": yearly_energy,
        }
