"""ABCD RS-485 frame building and parsing. Pure functions, no serial dependency."""

import struct

from .const import OP_ACK, SAM


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
    """Build an ABCD protocol frame: [dst][src][len][0x00 0x00][op][data][crc]."""
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
