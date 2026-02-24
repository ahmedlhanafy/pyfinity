# pyfinity

Remote control for **non-WiFi Carrier Infinity Touch thermostats** via the RS-485 ABCD bus.

This is the first known solution for controlling a Carrier Infinity Touch thermostat (SYSTXCCITN01) without WiFi. No cloud, no proprietary hardware — just a $15 USB adapter and Python.

## What it does

```
$ ./carrier_ctl.py status

Indoor:    68°F
Outdoor:   47°F
Heat set:  68°F
Cool set:  75°F

      Energy   HP heat   Cooling    Elec    Fan   Total
----------------------------------------------------
   Yesterday       17         0      10      0     27 kWh
  2 days ago       25         0      18      0     43 kWh

      Yearly   HP heat   Cooling    Elec    Fan   Total
----------------------------------------------------
    2026 YTD      362         0    7343     --   7705 kWh
        2025     2637       527    3931     15   7110 kWh
```

```
$ ./carrier_ctl.py set-heat 71
Heat: 68°F → 71°F...... done! (71°F)

$ ./carrier_ctl.py set-cool 76
Cool: 75°F → 76°F...... done! (76°F)
```

## Requirements

- Python 3.10+
- [pyserial](https://pypi.org/project/pyserial/): `pip install pyserial`
- USB-to-RS485 adapter (any FTDI-based adapter works, ~$15)
- Carrier Infinity Touch thermostat connected via ABCD bus

## Hardware setup

1. Get a USB-to-RS485 adapter (e.g. [Waveshare USB to RS485](https://www.amazon.com/Industrial-Converter-Adapter-Protection-Support/dp/B0B2QSW67D))
2. Connect two wires from your thermostat's **A** and **B** terminals to the adapter's **A+** and **B-** terminals
3. Plug the USB end into your computer or Raspberry Pi

You can tap into the A/B terminals at the thermostat wall plate — no need to access the furnace. Just piggyback your wires alongside the existing ones under the screw terminals.

**Warning:** Do NOT connect to the C or D terminals. They carry 24VAC and will fry your adapter.

## Usage

```bash
# Read current status
./carrier_ctl.py status

# Set heat setpoint (55-85°F)
./carrier_ctl.py set-heat 72

# Set cool setpoint (60-90°F)
./carrier_ctl.py set-cool 76

# Specify serial port manually (auto-detected by default)
./carrier_ctl.py --port /dev/ttyUSB0 status
```

## How it works

The Carrier Infinity system uses a proprietary RS-485 bus (called ABCD) at 38400 baud. The thermostat, air handler, and heat pump all communicate on this bus.

This tool impersonates a SAM (System Access Module) at address `0x9201` and reads/writes thermostat table `00400a` — the Zone 1 comfort profile. The active heat setpoint lives at byte 25, cool setpoint at byte 26.

Writes require persistence: the tool writes the new value 6 times at 5-second intervals to reliably land in the thermostat's internal processing window.

## Compatibility

Tested on:
- **Thermostat:** Carrier Infinity Touch SYSTXCCITN01-A (non-WiFi)
- **Air Handler:** Variable Speed Fan Coil (CESR131329-17)
- **Heat Pump:** Variable Speed Compressor (CESR131438-09)
- **OS:** macOS, should work on Linux/Raspberry Pi

## Limitations

- Set commands take ~30 seconds due to the persistence write method

## Disclaimer

Use at your own risk. This tool communicates directly with your HVAC system via a reverse-engineered protocol. The authors are not responsible for any damage to your equipment.

## License

MIT
