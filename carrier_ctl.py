#!/usr/bin/env python3
"""Carrier Infinity Touch thermostat control via ABCD RS-485 bus.

Usage:
    ./carrier_ctl.py status                # read temps and setpoints
    ./carrier_ctl.py set-heat <temp>       # set heat setpoint (55-85°F)
    ./carrier_ctl.py set-cool <temp>       # set cool setpoint (60-90°F)

Requires: pip install pyserial
"""

import argparse
import sys

from carrier_infinity_lib import COOL_SETPOINT_BYTE, HEAT_SETPOINT_BYTE
from carrier_infinity_lib.const import COOL_MIN, COOL_MAX, HEAT_MIN, HEAT_MAX
from carrier_infinity_lib.device import CarrierInfinityDevice
from carrier_infinity_lib.serial_bus import SerialBus


def print_status(device: CarrierInfinityDevice):
    """Read and display indoor temp, outdoor temp, setpoints, and energy."""
    status = device.get_status()
    indoor = status["indoor_temp"]
    outdoor = status["outdoor_temp"]
    heat_sp = status["heat_setpoint"]
    cool_sp = status["cool_setpoint"]

    print(f"Indoor:    {indoor}°F" if indoor else "Indoor:    --")
    print(f"Outdoor:   {outdoor}°F" if outdoor else "Outdoor:   --")
    print(f"Heat set:  {heat_sp}°F" if heat_sp else "Heat set:  --")
    print(f"Cool set:  {cool_sp}°F" if cool_sp else "Cool set:  --")

    days = device.get_daily_energy()
    if days:
        labels = ["Yesterday", "2 days ago"]
        print(f"\n{'Energy':>12s}  {'HP heat':>8s}  {'Cooling':>8s}  {'Elec':>6s}  {'Fan':>5s}  {'Total':>6s}")
        print("-" * 52)
        for i, day in enumerate(days[:2]):
            total = day["hp_heat"] + day["cooling"] + day["elec_heat"] + day["fan"] + day["reheat"]
            label = labels[i] if i < len(labels) else f"{i+1} days ago"
            print(f"{label:>12s}  {day['hp_heat']:>7d}  {day['cooling']:>8d}  {day['elec_heat']:>6d}  {day['fan']:>5d}  {total:>5d} kWh")

    yearly = device.get_yearly_energy()
    if yearly:
        cur = yearly["current"]
        prev = yearly["previous"]
        cur_total = cur["hp_heat"] + cur["elec_heat"] + cur["cooling"]
        prev_total = prev["hp_heat"] + prev["elec_heat"] + prev["cooling"] + prev.get("fan", 0)
        print(f"\n{'Yearly':>12s}  {'HP heat':>8s}  {'Cooling':>8s}  {'Elec':>6s}  {'Fan':>5s}  {'Total':>6s}")
        print("-" * 52)
        print(f"{'2026 YTD':>12s}  {cur['hp_heat']:>7d}  {cur['cooling']:>8d}  {cur['elec_heat']:>6d}  {'--':>5s}  {cur_total:>5d} kWh")
        print(f"{'2025':>12s}  {prev['hp_heat']:>7d}  {prev['cooling']:>8d}  {prev['elec_heat']:>6d}  {prev.get('fan', 0):>5d}  {prev_total:>5d} kWh")


def set_setpoint_cli(device: CarrierInfinityDevice, target: int, byte_offset: int, label: str):
    """Set setpoint with CLI progress output."""
    profile = device.read_comfort_profile()
    if not profile:
        print("Error: could not read current setpoints")
        return

    current = profile[byte_offset]
    if current == target:
        print(f"{label} already at {target}°F")
        return

    print(f"{label}: {current}°F → {target}°F", end="", flush=True)

    success = device.set_setpoint(target, byte_offset)

    if success:
        print(f" done! ({target}°F)")
    else:
        profile = device.read_comfort_profile()
        final = profile[byte_offset] if profile else None
        print(f" detected {final}°F (may need more time)")


def main():
    parser = argparse.ArgumentParser(description="Carrier Infinity Touch thermostat control")
    parser.add_argument("--port", help="serial port (auto-detected if omitted)")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status", help="read current temps and setpoints")

    heat_parser = sub.add_parser("set-heat", help="set heat setpoint")
    heat_parser.add_argument("temp", type=int, help=f"target temperature ({HEAT_MIN}-{HEAT_MAX}°F)")

    cool_parser = sub.add_parser("set-cool", help="set cool setpoint")
    cool_parser.add_argument("temp", type=int, help=f"target temperature ({COOL_MIN}-{COOL_MAX}°F)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    port = args.port or SerialBus.find_port()
    if not port:
        print("Error: no USB serial device found")
        sys.exit(1)

    bus = SerialBus(port)
    device = CarrierInfinityDevice(bus)

    try:
        if args.command == "status":
            print_status(device)
        elif args.command == "set-heat":
            if not HEAT_MIN <= args.temp <= HEAT_MAX:
                print(f"Error: temperature must be {HEAT_MIN}-{HEAT_MAX}°F")
                return
            set_setpoint_cli(device, args.temp, HEAT_SETPOINT_BYTE, "Heat")
        elif args.command == "set-cool":
            if not COOL_MIN <= args.temp <= COOL_MAX:
                print(f"Error: temperature must be {COOL_MIN}-{COOL_MAX}°F")
                return
            set_setpoint_cli(device, args.temp, COOL_SETPOINT_BYTE, "Cool")
    finally:
        bus.close()


if __name__ == "__main__":
    main()
