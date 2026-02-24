#!/usr/bin/env python3
"""Carrier Infinity Touch thermostat control via ABCD RS-485 bus.

Usage:
    ./carrier_ctl.py status                # read temps and setpoints
    ./carrier_ctl.py set-heat <temp>       # set heat setpoint (55-85°F)
    ./carrier_ctl.py set-cool <temp>       # set cool setpoint (60-90°F)

Requires: pip install pyserial
"""

import argparse
import glob
import struct
import sys
import time

import serial

# Device addresses
TSTAT = 0x2001
SAM = 0x9201
HEATPUMP = 0x5101

# Opcodes
OP_READ = 0x0B
OP_WRITE = 0x0C
OP_ACK = 0x06

# 00400a byte offsets
HEAT_SETPOINT_BYTE = 25
COOL_SETPOINT_BYTE = 26


def crc16(data: bytes) -> bytes:
    """CRC-16/ARC: poly=0x8005 reversed, init=0, final=0."""
    crc = 0
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return struct.pack("<H", crc)


def build_frame(dst: int, src: int, op: int, data: bytes) -> bytes:
    frame = bytearray()
    frame += struct.pack(">H", dst)
    frame += struct.pack(">H", src)
    frame += struct.pack("B", len(data))
    frame += bytes([0x00, 0x00, op])
    frame += data
    frame += crc16(frame)
    return bytes(frame)


def parse_response(buf: bytes, expected_src: int, expected_table: str = ""):
    """Parse frames from buffer, return first ACK from expected source matching table."""
    table_bytes = bytes.fromhex(expected_table) if expected_table else b""
    pos = 0
    while pos < len(buf) - 10:
        dlen = buf[pos + 4]
        frame_len = dlen + 10
        if dlen > 200 or dlen < 1 or pos + frame_len > len(buf):
            pos += 1
            continue
        frame_bytes = buf[pos : pos + frame_len]
        cksum = crc16(frame_bytes[:-2])
        if cksum == frame_bytes[-2:]:
            src = struct.unpack(">H", frame_bytes[2:4])[0]
            dst = struct.unpack(">H", frame_bytes[0:2])[0]
            op = frame_bytes[7]
            data = frame_bytes[8:-2]
            if src == expected_src and dst == SAM and op == OP_ACK:
                if table_bytes and len(data) >= 3 and data[:3] != table_bytes:
                    pos += frame_len
                    continue
                return data
            pos += frame_len
        else:
            pos += 1
    return None


def find_serial_port() -> str:
    ports = glob.glob("/dev/tty.usb*")
    if not ports:
        print("Error: no USB serial device found")
        sys.exit(1)
    return ports[0]


def read_table(ser: serial.Serial, device: int, table_hex: str) -> bytes | None:
    """Send READ request and return response data."""
    table_bytes = bytes.fromhex(table_hex)
    frame = build_frame(device, SAM, OP_READ, table_bytes)

    ser.read(ser.in_waiting)  # flush
    ser.write(frame)

    buf = bytearray()
    start = time.time()
    while time.time() - start < 2:
        chunk = ser.read(512)
        if chunk:
            buf.extend(chunk)
        resp = parse_response(bytes(buf), device, table_hex)
        if resp is not None and len(resp) >= 6:
            return resp[6:]
    return None


def write_table(ser: serial.Serial, device: int, table_hex: str, data: bytes):
    """Send WRITE request to device."""
    table_bytes = bytes.fromhex(table_hex)
    flags = bytes([0x00, 0x00, 0x00])
    payload = table_bytes + flags + data
    frame = build_frame(device, SAM, OP_WRITE, payload)
    ser.read(ser.in_waiting)
    ser.write(frame)
    time.sleep(0.05)


def read_comfort_profile(ser: serial.Serial) -> bytes | None:
    """Read 00400a with retry."""
    for _ in range(3):
        try:
            data = read_table(ser, TSTAT, "00400a")
            if data and len(data) > COOL_SETPOINT_BYTE:
                return data
        except OSError:
            pass
        time.sleep(0.5)
    return None


def get_energy(ser: serial.Serial):
    """Read daily energy usage from table 00460e (10-byte records)."""
    data = read_table(ser, TSTAT, "00460e")
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


def get_yearly_energy(ser: serial.Serial):
    """Read yearly energy totals from table 004610."""
    data = read_table(ser, TSTAT, "004610")
    if not data or len(data) < 37:
        return None
    # 2026 (current year) block starts at byte 3, uint16 every 4 bytes
    # 2025 (previous year) block starts at byte 19
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


def get_status(ser: serial.Serial):
    """Read and display indoor temp, outdoor temp, setpoints, and energy."""
    data = read_table(ser, HEATPUMP, "000304")
    indoor = data[10] if data and len(data) > 10 else None

    data = read_table(ser, HEATPUMP, "00061f")
    outdoor = data[32] if data and len(data) > 32 else None

    profile = read_comfort_profile(ser)
    heat_sp = profile[HEAT_SETPOINT_BYTE] if profile else None
    cool_sp = profile[COOL_SETPOINT_BYTE] if profile else None

    print(f"Indoor:    {indoor}°F" if indoor else "Indoor:    --")
    print(f"Outdoor:   {outdoor}°F" if outdoor else "Outdoor:   --")
    print(f"Heat set:  {heat_sp}°F" if heat_sp else "Heat set:  --")
    print(f"Cool set:  {cool_sp}°F" if cool_sp else "Cool set:  --")

    days = get_energy(ser)
    if days:
        labels = ["Yesterday", "2 days ago"]
        print(f"\n{'Energy':>12s}  {'HP heat':>8s}  {'Cooling':>8s}  {'Elec':>6s}  {'Fan':>5s}  {'Total':>6s}")
        print("-" * 52)
        for i, day in enumerate(days[:2]):
            total = day["hp_heat"] + day["cooling"] + day["elec_heat"] + day["fan"] + day["reheat"]
            label = labels[i] if i < len(labels) else f"{i+1} days ago"
            print(f"{label:>12s}  {day['hp_heat']:>7d}  {day['cooling']:>8d}  {day['elec_heat']:>6d}  {day['fan']:>5d}  {total:>5d} kWh")

    yearly = get_yearly_energy(ser)
    if yearly:
        cur = yearly["current"]
        prev = yearly["previous"]
        cur_total = cur["hp_heat"] + cur["elec_heat"] + cur["cooling"]
        prev_total = prev["hp_heat"] + prev["elec_heat"] + prev["cooling"] + prev.get("fan", 0)
        print(f"\n{'Yearly':>12s}  {'HP heat':>8s}  {'Cooling':>8s}  {'Elec':>6s}  {'Fan':>5s}  {'Total':>6s}")
        print("-" * 52)
        print(f"{'2026 YTD':>12s}  {cur['hp_heat']:>7d}  {cur['cooling']:>8d}  {cur['elec_heat']:>6d}  {'--':>5s}  {cur_total:>5d} kWh")
        print(f"{'2025':>12s}  {prev['hp_heat']:>7d}  {prev['cooling']:>8d}  {prev['elec_heat']:>6d}  {prev.get('fan', 0):>5d}  {prev_total:>5d} kWh")


def set_setpoint(ser: serial.Serial, target: int, byte_offset: int, label: str):
    """Set a setpoint by writing to 00400a."""
    profile = read_comfort_profile(ser)
    if not profile:
        print("Error: could not read current setpoints")
        return False

    current = profile[byte_offset]
    if current == target:
        print(f"{label} already at {target}°F")
        return True

    print(f"{label}: {current}°F → {target}°F", end="", flush=True)

    for _ in range(6):
        print(".", end="", flush=True)
        try:
            data = read_table(ser, TSTAT, "00400a")
            if data:
                modified = bytearray(data)
                for i in range(len(modified)):
                    if modified[i] == current:
                        modified[i] = target
                write_table(ser, TSTAT, "00400a", bytes(modified))
        except OSError:
            pass
        time.sleep(5)

    profile = read_comfort_profile(ser)
    final = profile[byte_offset] if profile else None

    if final == target:
        print(f" done! ({target}°F)")
        return True
    else:
        print(f" detected {final}°F (may need more time)")
        return False


def main():
    parser = argparse.ArgumentParser(description="Carrier Infinity Touch thermostat control")
    parser.add_argument("--port", help="serial port (auto-detected if omitted)")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("status", help="read current temps and setpoints")

    heat_parser = sub.add_parser("set-heat", help="set heat setpoint")
    heat_parser.add_argument("temp", type=int, help="target temperature (55-85°F)")

    cool_parser = sub.add_parser("set-cool", help="set cool setpoint")
    cool_parser.add_argument("temp", type=int, help="target temperature (60-90°F)")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    port = args.port or find_serial_port()
    ser = serial.Serial(port, 38400, timeout=0.1)

    try:
        if args.command == "status":
            get_status(ser)
        elif args.command == "set-heat":
            if not 55 <= args.temp <= 85:
                print("Error: temperature must be 55-85°F")
                return
            set_setpoint(ser, args.temp, HEAT_SETPOINT_BYTE, "Heat")
        elif args.command == "set-cool":
            if not 60 <= args.temp <= 90:
                print("Error: temperature must be 60-90°F")
                return
            set_setpoint(ser, args.temp, COOL_SETPOINT_BYTE, "Cool")
    finally:
        ser.close()


if __name__ == "__main__":
    main()
