# Carrier Infinity Touch - RS-485 Remote Control

## Project
Remote control of non-WiFi Carrier Infinity Touch thermostat (SYSTXCCITN01) via ABCD RS-485 bus. First known solution for this hardware.

## Hardware
- Waveshare USB-to-RS485 adapter → thermostat A/B terminals
- Serial: 38400 baud, CRC-16/ARC

## Scripts
- `carrier_ctl.py` - Main control tool
  - `status` - indoor/outdoor temps, setpoints, daily + yearly energy
  - `set-heat <temp>` - set heat setpoint (55-85°F)
  - `set-cool <temp>` - set cool setpoint (60-90°F)
  - Requires: `pyserial`

## Key Registers
- `00400a byte[25]` - heat setpoint (read/write)
- `00400a byte[26]` - cool setpoint (read/write)
- `HP 000304 byte[10]` - indoor temp
- `HP 00061f byte[32]` - outdoor temp
- `TS 00460e` - daily energy (10-byte records)
- `TS 004610` - yearly energy totals

## Write Method
Read table 00400a → replace current setpoint bytes → write back. Repeat 6 rounds at 5s intervals (timing-dependent).

## Raspberry Pi Deployment
- Host: `ahmedelhanafy@carrier.local`
- App dir: `/opt/pyfinity` (owned by root)
- Repo: `~/pyfinity` (user clone for git pull)
- Deploy: `cd ~/pyfinity && git pull && bash setup_pi.sh`
- setup_pi.sh copies files to /opt/pyfinity, preserves config files (settings.json, energy_history.json, etc.)
- Service: `pyfinity.service` (systemd), runs as root on port 5050

## Energy Data Architecture
- **Bus reads**: Only the 2 AM background collector reads daily energy from the RS-485 bus (table 00460e)
- **Storage**: `energy_history.json` in /opt/pyfinity, keyed by date (YYYY-MM-DD)
- **API endpoints**: `/api/energy`, `/api/energy/daily`, `/api/energy/summary` all read from history JSON only — no bus reads
- **Yearly energy**: `/api/energy/yearly` and `/api/energy?range=year` still read from bus (table 004610) since there's no history equivalent
- **Corruption filter**: Collector skips records with any category > 150 kWh

## Progress & Research
Full reverse engineering notes, table dump, and methodology: @progress.txt

## Always
- When making any changes or discoveries, update @progress.txt with the new findings
- NEVER commit and push without asking me first
