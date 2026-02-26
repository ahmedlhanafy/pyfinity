#!/usr/bin/env python3
"""Web control panel for Carrier Infinity Touch thermostat."""

import json
import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Flask, Response, request, send_from_directory

from carrier_infinity_lib import COOL_SETPOINT_BYTE, HEAT_SETPOINT_BYTE
from carrier_infinity_lib.device import CarrierInfinityDevice
from carrier_infinity_lib.serial_bus import SerialBus

app = Flask(__name__)

# --- Device management ---
_device = None
_lock = threading.Lock()

SCHEDULE_FILE = Path(__file__).parent / "schedule.json"

DEFAULT_SCHEDULE = {
    "mode": "manual",
    "weekday": [
        {"period": "sleep", "start": "22:00", "heat": 65, "cool": 78},
        {"period": "wake", "start": "06:30", "heat": 70, "cool": 76},
        {"period": "home", "start": "08:00", "heat": 68, "cool": 75},
        {"period": "away", "start": "17:00", "heat": 62, "cool": 80},
    ],
    "weekend": [
        {"period": "sleep", "start": "22:00", "heat": 65, "cool": 78},
        {"period": "wake", "start": "08:00", "heat": 70, "cool": 76},
        {"period": "home", "start": "09:00", "heat": 68, "cool": 75},
        {"period": "away", "start": "17:00", "heat": 62, "cool": 80},
    ],
}

# --- Schedule state ---
_schedule = None
_last_applied_period = None


def load_schedule() -> dict:
    global _schedule
    if SCHEDULE_FILE.exists():
        try:
            _schedule = json.loads(SCHEDULE_FILE.read_text())
        except Exception:
            _schedule = dict(DEFAULT_SCHEDULE)
    else:
        _schedule = dict(DEFAULT_SCHEDULE)
    return _schedule


def save_schedule():
    SCHEDULE_FILE.write_text(json.dumps(_schedule, indent=2))


def get_schedule() -> dict:
    if _schedule is None:
        load_schedule()
    return _schedule


def get_active_period(now=None) -> dict | None:
    """Find the active period based on current time."""
    sched = get_schedule()
    if now is None:
        now = datetime.now()
    day_type = "weekday" if now.weekday() < 5 else "weekend"
    periods = sched.get(day_type, [])
    if not periods:
        return None

    now_minutes = now.hour * 60 + now.minute
    # Sort by start time
    sorted_periods = sorted(periods, key=lambda p: _time_to_minutes(p["start"]))

    active = sorted_periods[-1]  # default to last (wraps from previous day)
    for p in sorted_periods:
        if _time_to_minutes(p["start"]) <= now_minutes:
            active = p
    return active


def get_next_transition(now=None) -> str | None:
    """Get description of next schedule transition."""
    sched = get_schedule()
    if now is None:
        now = datetime.now()
    day_type = "weekday" if now.weekday() < 5 else "weekend"
    periods = sched.get(day_type, [])
    if not periods:
        return None

    now_minutes = now.hour * 60 + now.minute
    sorted_periods = sorted(periods, key=lambda p: _time_to_minutes(p["start"]))

    for p in sorted_periods:
        if _time_to_minutes(p["start"]) > now_minutes:
            return f"{p['period'].title()} at {p['start']}"

    # Wrap to next day's first period
    next_day = "weekend" if now.weekday() == 4 else ("weekday" if now.weekday() == 5 else day_type)
    next_periods = sorted(sched.get(next_day, periods), key=lambda p: _time_to_minutes(p["start"]))
    if next_periods:
        return f"{next_periods[0]['period'].title()} at {next_periods[0]['start']} (tomorrow)"
    return None


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


# --- Device management ---

def get_device() -> CarrierInfinityDevice:
    global _device
    if _device is not None:
        try:
            if _device.bus._ser.is_open:
                return _device
        except Exception:
            pass
        try:
            _device.bus.close()
        except Exception:
            pass
        _device = None

    port = SerialBus.find_port()
    if not port:
        raise RuntimeError("No USB serial device found. Plug in the adapter.")
    _device = CarrierInfinityDevice(SerialBus(port))
    return _device


def with_device(fn):
    global _device
    with _lock:
        try:
            device = get_device()
            return fn(device)
        except Exception:
            try:
                if _device:
                    _device.bus.close()
            except Exception:
                pass
            _device = None
            device = get_device()
            return fn(device)


def json_response(data, status=200):
    return Response(json.dumps(data), status=status, mimetype="application/json")


# --- Scheduler thread ---

def scheduler_loop():
    """Background thread: applies schedule temps when period changes."""
    global _last_applied_period
    while True:
        try:
            sched = get_schedule()
            if sched.get("mode") == "schedule":
                period = get_active_period()
                if period and period["period"] != _last_applied_period:
                    print(f"[scheduler] Period changed to: {period['period']} "
                          f"(heat={period['heat']}, cool={period['cool']})")
                    try:
                        with_device(lambda d: d.set_setpoint(period["heat"], HEAT_SETPOINT_BYTE))
                    except Exception as e:
                        print(f"[scheduler] Heat set failed: {e}")
                    try:
                        with_device(lambda d: d.set_setpoint(period["cool"], COOL_SETPOINT_BYTE))
                    except Exception as e:
                        print(f"[scheduler] Cool set failed: {e}")
                    _last_applied_period = period["period"]
        except Exception as e:
            print(f"[scheduler] Error: {e}")
        time.sleep(60)


# --- Routes ---

WEB_DIR = Path(__file__).parent / "web" / "dist"


@app.route("/")
def index():
    return send_from_directory(WEB_DIR, "index.html")



@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(WEB_DIR, path)


@app.route("/api/status")
def api_status():
    try:
        def read(device):
            status = device.get_status()
            daily = device.get_daily_energy()
            yearly = device.get_yearly_energy()

            def day_total(d):
                return sum(d.get(k, 0) for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"])

            yesterday = day_total(daily[0]) if len(daily) > 0 else None
            two_days = day_total(daily[1]) if len(daily) > 1 else None
            ytd = None
            if yearly and "current" in yearly:
                c = yearly["current"]
                ytd = c.get("hp_heat", 0) + c.get("elec_heat", 0) + c.get("cooling", 0)

            # Schedule info
            sched = get_schedule()
            active = get_active_period()
            next_trans = get_next_transition()

            return {
                "indoor_temp": status["indoor_temp"],
                "outdoor_temp": status["outdoor_temp"],
                "heat_setpoint": status["heat_setpoint"],
                "cool_setpoint": status["cool_setpoint"],
                "energy_yesterday": yesterday,
                "energy_2days": two_days,
                "energy_ytd": ytd,
                "schedule_mode": sched.get("mode", "manual"),
                "active_period": active["period"] if active else None,
                "active_period_heat": active["heat"] if active else None,
                "active_period_cool": active["cool"] if active else None,
                "next_transition": next_trans,
            }

        return json_response(with_device(read))
    except Exception as e:
        return json_response({"error": str(e)}, 500)


@app.route("/api/set", methods=["POST"])
def api_set():
    global _last_applied_period
    data = request.get_json()
    mode = data.get("mode", "heat")
    temp = int(data.get("temp", 68))

    # If user manually sets temp, switch to manual mode
    if data.get("switch_to_manual") or get_schedule().get("mode") == "schedule":
        sched = get_schedule()
        sched["mode"] = "manual"
        _last_applied_period = None
        save_schedule()

    if mode == "heat":
        if not 55 <= temp <= 85:
            return json_response({"error": "Heat: 55-85°F"}, 400)
        byte_offset = HEAT_SETPOINT_BYTE
    else:
        if not 60 <= temp <= 90:
            return json_response({"error": "Cool: 60-90°F"}, 400)
        byte_offset = COOL_SETPOINT_BYTE

    def do_set():
        try:
            with_device(lambda d: d.set_setpoint(temp, byte_offset))
        except Exception as e:
            print(f"Set failed: {e}")

    threading.Thread(target=do_set, daemon=True).start()
    return json_response({"ok": True, "target": temp, "mode": mode})


@app.route("/api/schedule", methods=["GET"])
def api_schedule_get():
    return json_response(get_schedule())


@app.route("/api/schedule", methods=["POST"])
def api_schedule_save():
    data = request.get_json()
    sched = get_schedule()
    if "weekday" in data:
        sched["weekday"] = data["weekday"]
    if "weekend" in data:
        sched["weekend"] = data["weekend"]
    save_schedule()
    return json_response({"ok": True})


@app.route("/api/schedule/mode", methods=["POST"])
def api_schedule_mode():
    global _last_applied_period
    data = request.get_json()
    new_mode = data.get("mode", "manual")
    sched = get_schedule()
    sched["mode"] = new_mode
    save_schedule()

    if new_mode == "schedule":
        # Immediately apply current period
        _last_applied_period = None  # force re-apply
    return json_response({"ok": True, "mode": new_mode})


if __name__ == "__main__":
    load_schedule()
    # Start scheduler thread
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()
    print("Starting Carrier Infinity control panel...")
    print("Open http://localhost:5050")
    app.run(host="0.0.0.0", port=5050, debug=False)
