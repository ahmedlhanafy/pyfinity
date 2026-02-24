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

## Progress & Research
Full reverse engineering notes, table dump, and methodology: @progress.txt

## Always
- When making any changes or discoveries, update @progress.txt with the new findings
