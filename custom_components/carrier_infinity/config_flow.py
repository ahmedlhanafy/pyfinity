"""Config flow for Carrier Infinity Touch integration."""

import logging

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_PORT

from .const import CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN

_LOGGER = logging.getLogger(__name__)


class CarrierInfinityConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Carrier Infinity Touch."""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        """Handle the initial step: serial port selection."""
        errors = {}

        if user_input is not None:
            port = user_input[CONF_PORT]

            # Validate connection
            try:
                from carrier_infinity_lib.device import CarrierInfinityDevice
                from carrier_infinity_lib.serial_bus import SerialBus

                bus = await self.hass.async_add_executor_job(SerialBus, port)
                device = CarrierInfinityDevice(bus)
                status = await self.hass.async_add_executor_job(device.get_status)
                await self.hass.async_add_executor_job(bus.close)

                if status["indoor_temp"] is None:
                    errors["base"] = "cannot_connect"
            except Exception:
                _LOGGER.exception("Failed to connect to %s", port)
                errors["base"] = "cannot_connect"

            if not errors:
                await self.async_set_unique_id(port)
                self._abort_if_unique_id_configured()

                return self.async_create_entry(
                    title=f"Carrier Infinity ({port})",
                    data={
                        CONF_PORT: port,
                        CONF_SCAN_INTERVAL: user_input.get(
                            CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL
                        ),
                    },
                )

        # List available serial ports
        from carrier_infinity_lib.serial_bus import SerialBus

        ports = await self.hass.async_add_executor_job(SerialBus.list_ports)
        if not ports:
            return self.async_abort(reason="no_ports")

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_PORT): vol.In(ports),
                    vol.Optional(
                        CONF_SCAN_INTERVAL, default=DEFAULT_SCAN_INTERVAL
                    ): vol.All(int, vol.Range(min=30, max=300)),
                }
            ),
            errors=errors,
        )
