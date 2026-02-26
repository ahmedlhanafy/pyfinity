"""Serial bus abstraction with thread-safe access."""

import logging
import threading
import time

import serial
import serial.tools.list_ports

from .const import DEFAULT_BAUDRATE, OP_READ, OP_WRITE, SAM
from .protocol import build_frame, parse_response

_LOGGER = logging.getLogger(__name__)


class SerialBus:
    """Thread-safe RS-485 bus communication."""

    def __init__(self, port: str, baudrate: int = DEFAULT_BAUDRATE):
        self.port = port
        self._ser = serial.Serial(port, baudrate, timeout=0.1)
        self._lock = threading.Lock()

    def read_table(self, device: int, table_hex: str) -> bytes | None:
        """Send READ request and return response data (without 6-byte header)."""
        with self._lock:
            table_bytes = bytes.fromhex(table_hex)
            frame = build_frame(device, SAM, OP_READ, table_bytes)

            self._ser.read(self._ser.in_waiting)  # flush
            self._ser.write(frame)

            buf = bytearray()
            start = time.time()
            while time.time() - start < 2:
                chunk = self._ser.read(512)
                if chunk:
                    buf.extend(chunk)
                resp = parse_response(bytes(buf), device, table_hex)
                if resp is not None and len(resp) >= 6:
                    return resp[6:]
            return None

    def write_table(self, device: int, table_hex: str, data: bytes):
        """Send WRITE request to device."""
        with self._lock:
            table_bytes = bytes.fromhex(table_hex)
            flags = bytes([0x00, 0x00, 0x00])
            payload = table_bytes + flags + data
            frame = build_frame(device, SAM, OP_WRITE, payload)
            self._ser.read(self._ser.in_waiting)
            self._ser.write(frame)
            time.sleep(0.05)

    def close(self):
        """Close serial port."""
        if self._ser and self._ser.is_open:
            self._ser.close()

    @staticmethod
    def find_port() -> str | None:
        """Find first USB serial port (cross-platform)."""
        for port in serial.tools.list_ports.comports():
            if "usb" in port.device.lower() or "usb" in (port.description or "").lower():
                return port.device
        return None

    @staticmethod
    def list_ports() -> dict[str, str]:
        """List all serial ports as {device: description}."""
        return {p.device: p.description for p in serial.tools.list_ports.comports()}
