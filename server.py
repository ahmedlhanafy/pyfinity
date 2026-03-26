#!/usr/bin/env python3
"""Web control panel for Carrier Infinity Touch thermostat."""

import argparse
import json
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path

from flask import Flask, Response, request, send_from_directory

from carrier_infinity_lib import COOL_SETPOINT_BYTE, HEAT_SETPOINT_BYTE
from carrier_infinity_lib.device import CarrierInfinityDevice
from carrier_infinity_lib.serial_bus import SerialBus

app = Flask(__name__)

# --- Config paths ---
BASE_DIR = Path(__file__).parent
SCHEDULE_FILE = BASE_DIR / "schedule.json"
SETTINGS_FILE = BASE_DIR / "settings.json"
ENERGY_FILE = BASE_DIR / "energy_history.json"
RING_AUTH_FILE = BASE_DIR / "ring_auth.json"

# --- Global state ---
_device = None
_lock = threading.Lock()
_mock_mode = False
_schedule = None
_last_applied_period = None
_ring_status = {"mode": None, "connected": False}
_ring_lock = threading.Lock()

# --- Default configs ---
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
    "ring": {
        "disarmed": {"heat": 68, "cool": 75},
        "home": {"heat": 70, "cool": 74},
        "away": {"heat": 62, "cool": 80},
    },
    "ring_enabled": False,
    "ring_mapping": {
        "disarmed": "home",
        "home": "home",
        "away": "away",
    },
}

DEFAULT_SETTINGS = {
    "unit": "F",
    "theme": "dark",
    "cost_per_kwh": 0.12,
    "city": "",
    "openweather_api_key": "",
}

# --- Weather state ---
_weather_data = {"temp": None, "updated": None}
_weather_lock = threading.Lock()


# ── Schedule management ──────────────────────────────────────────────

def load_schedule() -> dict:
    global _schedule
    if SCHEDULE_FILE.exists():
        try:
            _schedule = json.loads(SCHEDULE_FILE.read_text())
            # Ensure ring config exists
            if "ring" not in _schedule:
                _schedule["ring"] = dict(DEFAULT_SCHEDULE["ring"])
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
    sched = get_schedule()
    if now is None:
        now = datetime.now()
    day_type = "weekday" if now.weekday() < 5 else "weekend"
    periods = sched.get(day_type, [])
    if not periods:
        return None
    now_minutes = now.hour * 60 + now.minute
    sorted_periods = sorted(periods, key=lambda p: _time_to_minutes(p["start"]))
    active = sorted_periods[-1]
    for p in sorted_periods:
        if _time_to_minutes(p["start"]) <= now_minutes:
            active = p
    return active


def get_next_transition(now=None) -> str | None:
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
    next_day = "weekend" if now.weekday() == 4 else ("weekday" if now.weekday() == 5 else day_type)
    next_periods = sorted(sched.get(next_day, periods), key=lambda p: _time_to_minutes(p["start"]))
    if next_periods:
        return f"{next_periods[0]['period'].title()} at {next_periods[0]['start']} (tomorrow)"
    return None


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


# ── Settings management ──────────────────────────────────────────────

def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return {**DEFAULT_SETTINGS, **json.loads(SETTINGS_FILE.read_text())}
        except Exception:
            pass
    return dict(DEFAULT_SETTINGS)


def save_settings(data: dict):
    current = load_settings()
    current.update(data)
    SETTINGS_FILE.write_text(json.dumps(current, indent=2))
    return current


# ── Energy history management ────────────────────────────────────────

def load_energy_history() -> dict:
    if ENERGY_FILE.exists():
        try:
            return json.loads(ENERGY_FILE.read_text())
        except Exception:
            pass
    return {}


def save_energy_history(data: dict):
    ENERGY_FILE.write_text(json.dumps(data, indent=2))


def collect_daily_energy():
    """Collect yesterday's energy and store in history. Only runs 2-4 AM."""
    now = datetime.now()
    if not (2 <= now.hour < 4):
        return

    try:
        daily = with_device(lambda d: d.get_daily_energy())
        if not daily:
            return

        history = load_energy_history()
        yesterday = (now - timedelta(days=1)).strftime("%Y-%m-%d")

        if yesterday not in history and len(daily) > 0:
            d = daily[0]
            # Skip if values look like yearly totals (corrupt record)
            if any(d.get(k, 0) > 150 for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"]):
                return
            history[yesterday] = {
                "hp_heat": d.get("hp_heat", 0),
                "cooling": d.get("cooling", 0),
                "elec_heat": d.get("elec_heat", 0),
                "fan": d.get("fan", 0),
                "reheat": d.get("reheat", 0),
            }
            save_energy_history(history)
            print(f"[energy] Saved energy for {yesterday}: {sum(history[yesterday].values())} kWh")
    except Exception as e:
        print(f"[energy] Collection failed: {e}")


def energy_collector_loop():
    """Background thread: collects energy data once per day between 2-4 AM."""
    while True:
        collect_daily_energy()
        time.sleep(1800)  # Check every 30 min


# ── Device management ────────────────────────────────────────────────

def get_device() -> CarrierInfinityDevice:
    global _device
    if _device is not None:
        if _mock_mode:
            return _device
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

    if _mock_mode:
        from carrier_infinity_lib.mock_device import MockDevice
        _device = MockDevice()
        return _device

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
            if not _mock_mode:
                try:
                    if _device and hasattr(_device, 'bus'):
                        _device.bus.close()
                except Exception:
                    pass
                _device = None
                device = get_device()
                return fn(device)
            raise


def json_response(data, status=200):
    return Response(json.dumps(data), status=status, mimetype="application/json")


# ── Scheduler thread ─────────────────────────────────────────────────

def scheduler_loop():
    """Background thread: applies schedule/ring temps when period changes."""
    global _last_applied_period
    while True:
        try:
            sched = get_schedule()
            mode = sched.get("mode", "manual")

            if mode == "schedule":
                # Check if Ring integration overrides schedule
                ring_override = False
                ring_en = sched.get("ring_enabled")
                if ring_en:
                    with _ring_lock:
                        ring_mode = _ring_status.get("mode")
                    mapping = sched.get("ring_mapping", {})
                    mapped_slot = mapping.get(ring_mode) if ring_mode else None
                    print(f"[scheduler] Ring check: enabled={ring_en}, ring_mode={ring_mode}, "
                          f"mapped_slot={mapped_slot}, last={_last_applied_period}")
                    if ring_mode and mapped_slot and mapped_slot != "none":
                        # Find the mapped slot's temps from current schedule
                        day_key = "weekend" if datetime.now().weekday() >= 5 else "weekday"
                        slots = sched.get(day_key, [])
                        mapped_period = next((s for s in slots if s["period"] == mapped_slot), None)
                        if mapped_period:
                            key = f"ring:{ring_mode}:{mapped_slot}"
                            if key != _last_applied_period:
                                heat, cool = mapped_period["heat"], mapped_period["cool"]
                                print(f"[scheduler] Ring→{mapped_slot} "
                                      f"(heat={heat}, cool={cool})")
                                def apply_ring(h=heat, c=cool):
                                    try:
                                        with_device(lambda d: d.set_setpoint(h, HEAT_SETPOINT_BYTE))
                                    except Exception as e:
                                        print(f"[scheduler] Ring heat set failed: {e}")
                                    try:
                                        with_device(lambda d: d.set_setpoint(c, COOL_SETPOINT_BYTE))
                                    except Exception as e:
                                        print(f"[scheduler] Ring cool set failed: {e}")
                                threading.Thread(target=apply_ring, daemon=True).start()
                                _last_applied_period = key
                            ring_override = True

                if not ring_override:
                    period = get_active_period()
                    if period and period["period"] != _last_applied_period:
                        heat, cool = period["heat"], period["cool"]
                        print(f"[scheduler] Period changed to: {period['period']} "
                              f"(heat={heat}, cool={cool})")
                        def apply_period(h=heat, c=cool):
                            try:
                                with_device(lambda d: d.set_setpoint(h, HEAT_SETPOINT_BYTE))
                            except Exception as e:
                                print(f"[scheduler] Heat set failed: {e}")
                            try:
                                with_device(lambda d: d.set_setpoint(c, COOL_SETPOINT_BYTE))
                            except Exception as e:
                                print(f"[scheduler] Cool set failed: {e}")
                        threading.Thread(target=apply_period, daemon=True).start()
                        _last_applied_period = period["period"]

            elif mode == "ring":
                # Legacy standalone ring mode (backward compat)
                with _ring_lock:
                    ring_mode = _ring_status.get("mode")
                if ring_mode:
                    ring_cfg = sched.get("ring", {}).get(ring_mode)
                    if ring_cfg and ring_mode != _last_applied_period:
                        heat, cool = ring_cfg["heat"], ring_cfg["cool"]
                        print(f"[scheduler] Ring mode: {ring_mode} "
                              f"(heat={heat}, cool={cool})")
                        try:
                            with_device(lambda d: d.set_setpoint(heat, HEAT_SETPOINT_BYTE))
                        except Exception as e:
                            print(f"[scheduler] Ring heat set failed: {e}")
                        try:
                            with_device(lambda d: d.set_setpoint(cool, COOL_SETPOINT_BYTE))
                        except Exception as e:
                            print(f"[scheduler] Ring cool set failed: {e}")
                        _last_applied_period = ring_mode

        except Exception as e:
            print(f"[scheduler] Error: {e}")
        time.sleep(30)


# ── Ring polling thread ──────────────────────────────────────────────

def weather_polling_loop():
    """Background thread: fetches outdoor temp from OpenWeatherMap every 10 min."""
    global _weather_data
    import urllib.request
    import urllib.error

    while True:
        try:
            settings = load_settings()
            city = settings.get("city", "").strip()
            api_key = settings.get("openweather_api_key", "").strip()

            if city and api_key:
                if _mock_mode:
                    with _weather_lock:
                        _weather_data = {"temp": 72.5, "updated": datetime.now().isoformat()}
                else:
                    url = (
                        f"https://api.openweathermap.org/data/2.5/weather"
                        f"?q={urllib.request.quote(city)}&appid={api_key}&units=imperial"
                    )
                    req = urllib.request.Request(url, headers={"User-Agent": "Pyfinity/1.0"})
                    with urllib.request.urlopen(req, timeout=10) as resp:
                        data = json.loads(resp.read())
                        temp = data.get("main", {}).get("temp")
                        if temp is not None:
                            with _weather_lock:
                                _weather_data = {"temp": round(temp, 1), "updated": datetime.now().isoformat()}
                            print(f"[weather] Updated: {temp}°F")
            else:
                with _weather_lock:
                    _weather_data = {"temp": None, "updated": None}

        except Exception as e:
            print(f"[weather] Error: {e}")

        time.sleep(600)  # 10 minutes


def ring_polling_loop():
    """Background thread: polls Ring alarm mode via ring_doorbell library with auto-refresh."""
    global _ring_status
    import asyncio

    if _mock_mode:
        modes = ["disarmed", "home", "away"]
        idx = 0
        while True:
            with _ring_lock:
                _ring_status = {"mode": modes[idx % 3], "connected": True}
            idx += 1
            time.sleep(60)
        return

    if not RING_AUTH_FILE.exists():
        print("[ring] No ring_auth.json found. Run: python3 setup.py")
        return

    token_data = json.loads(RING_AUTH_FILE.read_text())
    if not token_data.get("access_token"):
        print("[ring] No access_token in ring_auth.json")
        return

    location_id = token_data.get("location_id")

    def token_updated(token):
        # Preserve location_id across token refreshes
        if location_id:
            token["location_id"] = location_id
        RING_AUTH_FILE.write_text(json.dumps(token))
        print("[ring] Token refreshed and saved")

    try:
        from ring_doorbell import Auth
        from ring_doorbell.exceptions import AuthenticationError
    except ImportError:
        print("[ring] ring_doorbell not installed. Run: pip install ring-doorbell")
        return

    loop = asyncio.new_event_loop()

    try:
        auth = Auth("CarrierControl/1.0", token_data, token_updated)

        # Discover location_id if not cached
        if not location_id:
            try:
                resp = loop.run_until_complete(
                    auth.async_query("https://api.ring.com/clients_api/ring_devices")
                )
                devices = resp.json()
                for category in devices.values():
                    if isinstance(category, list):
                        for d in category:
                            if isinstance(d, dict) and d.get("location_id"):
                                location_id = d["location_id"]
                                break
                    if location_id:
                        break
                if location_id:
                    token_data["location_id"] = location_id
                    RING_AUTH_FILE.write_text(json.dumps(token_data))
                    print(f"[ring] Location ID: {location_id}")
                else:
                    print("[ring] Could not find location_id from devices")
                    return
            except Exception as e:
                print(f"[ring] Failed to fetch location: {e}")
                return

        print(f"[ring] Polling alarm mode for location {location_id}")

        while True:
            try:
                resp = loop.run_until_complete(
                    auth.async_query(
                        f"https://app.ring.com/api/v1/mode/location/{location_id}"
                    )
                )
                data = resp.json()
                mode = data.get("mode")
                with _ring_lock:
                    _ring_status = {"mode": mode, "connected": True}

            except AuthenticationError:
                print("[ring] Refresh token expired — re-run: python3 setup.py")
                with _ring_lock:
                    _ring_status = {"mode": None, "connected": False}
                return
            except Exception as e:
                print(f"[ring] Poll error: {e}")
                with _ring_lock:
                    _ring_status = {"mode": None, "connected": False}

            time.sleep(30)
    finally:
        loop.run_until_complete(auth.async_close())
        loop.close()


# ── Routes ───────────────────────────────────────────────────────────

WEB_DIR = BASE_DIR / "web" / "dist"


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

            sched = get_schedule()
            active = get_active_period()
            next_trans = get_next_transition()

            with _ring_lock:
                ring_mode = _ring_status.get("mode")

            # Use weather API temp if available, else bus temp
            with _weather_lock:
                weather_temp = _weather_data.get("temp")
            outdoor = weather_temp if weather_temp is not None else status["outdoor_temp"]
            weather_source = "api" if weather_temp is not None else "bus"

            return {
                "indoor_temp": status["indoor_temp"],
                "outdoor_temp": outdoor,
                "weather_source": weather_source,
                "heat_setpoint": status["heat_setpoint"],
                "cool_setpoint": status["cool_setpoint"],
                "energy_yesterday": yesterday,
                "energy_2days": two_days,
                "energy_ytd": ytd,
                "control_mode": sched.get("mode", "manual"),
                "active_period": active["period"] if active else None,
                "active_period_heat": active["heat"] if active else None,
                "active_period_cool": active["cool"] if active else None,
                "next_transition": next_trans,
                "ring_mode": ring_mode,
            }

        return json_response(with_device(read))
    except Exception as e:
        return json_response({"error": str(e)}, 500)


@app.route("/api/set", methods=["POST"])
def api_set():
    data = request.get_json()
    mode = data.get("mode", "heat")
    temp = int(data.get("temp", 68))

    if mode == "heat":
        if not 55 <= temp <= 85:
            return json_response({"error": "Heat: 55-85\u00b0F"}, 400)
        byte_offset = HEAT_SETPOINT_BYTE
    else:
        if not 60 <= temp <= 90:
            return json_response({"error": "Cool: 60-90\u00b0F"}, 400)
        byte_offset = COOL_SETPOINT_BYTE

    def do_set():
        try:
            with_device(lambda d: d.set_setpoint(temp, byte_offset))
        except Exception as e:
            print(f"Set failed: {e}")

    threading.Thread(target=do_set, daemon=True).start()
    return json_response({"ok": True, "target": temp, "mode": mode})


@app.route("/api/mode", methods=["POST"])
def api_mode():
    global _last_applied_period
    data = request.get_json()
    new_mode = data.get("mode", "manual")
    if new_mode not in ("manual", "schedule", "ring"):
        return json_response({"error": "Invalid mode"}, 400)

    sched = get_schedule()
    sched["mode"] = new_mode
    save_schedule()

    _last_applied_period = None  # Force re-apply
    return json_response({"ok": True, "mode": new_mode})


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
    if "ring_enabled" in data:
        sched["ring_enabled"] = data["ring_enabled"]
    if "ring_mapping" in data:
        sched["ring_mapping"] = data["ring_mapping"]
    save_schedule()

    # If in schedule mode, apply current period's temps immediately
    if sched.get("mode") == "schedule":
        period = get_active_period()
        if period:
            def apply():
                try:
                    with_device(lambda d: d.set_setpoint(period["heat"], HEAT_SETPOINT_BYTE))
                    with_device(lambda d: d.set_setpoint(period["cool"], COOL_SETPOINT_BYTE))
                    print(f"[schedule] Applied edited temps: heat={period['heat']}, cool={period['cool']}")
                except Exception as e:
                    print(f"[schedule] Apply failed: {e}")
            threading.Thread(target=apply, daemon=True).start()

    return json_response({"ok": True})


# Keep old endpoint for backward compat during transition
@app.route("/api/schedule/mode", methods=["POST"])
def api_schedule_mode():
    return api_mode()


@app.route("/api/ring/status", methods=["GET"])
def api_ring_status():
    with _ring_lock:
        return json_response(dict(_ring_status))


@app.route("/api/ring/config", methods=["GET"])
def api_ring_config_get():
    sched = get_schedule()
    return json_response(sched.get("ring", DEFAULT_SCHEDULE["ring"]))


@app.route("/api/ring/config", methods=["POST"])
def api_ring_config_save():
    data = request.get_json()
    sched = get_schedule()
    sched["ring"] = data
    save_schedule()

    # If in ring mode, apply the active Ring mode's temps immediately
    if sched.get("mode") == "ring":
        with _ring_lock:
            ring_mode = _ring_status.get("mode")
        if ring_mode and ring_mode in data:
            cfg = data[ring_mode]
            def apply():
                try:
                    with_device(lambda d: d.set_setpoint(cfg["heat"], HEAT_SETPOINT_BYTE))
                    with_device(lambda d: d.set_setpoint(cfg["cool"], COOL_SETPOINT_BYTE))
                    print(f"[ring] Applied edited temps for {ring_mode}: heat={cfg['heat']}, cool={cfg['cool']}")
                except Exception as e:
                    print(f"[ring] Apply failed: {e}")
            threading.Thread(target=apply, daemon=True).start()

    return json_response({"ok": True})


def _valid_daily_record(d: dict) -> bool:
    """Filter out corrupt daily energy records (yearly totals leaking in)."""
    total = sum(d.get(k, 0) for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"])
    return total <= 80 and all(d.get(k, 0) <= 60 for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"])


def _get_device_daily() -> list[dict]:
    """Get filtered daily energy from device."""
    try:
        daily = with_device(lambda d: d.get_daily_energy())
        return [d for d in daily if _valid_daily_record(d)]
    except Exception:
        return []


@app.route("/api/energy", methods=["GET"])
def api_energy():
    range_type = request.args.get("range", "day")
    history = load_energy_history()

    if range_type == "day":
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        data = []
        if yesterday in history:
            data.append({"date": yesterday, **history[yesterday]})
        return json_response({"range": "day", "data": data})

    elif range_type == "week":
        data = {}
        for i in range(1, 8):
            date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
            if date in history:
                data[date] = history[date]

        result = [{"date": k, **v} for k, v in sorted(data.items())]
        return json_response({"range": "week", "data": result})

    elif range_type == "year":
        # Use thermostat yearly totals (much more accurate than sparse history)
        try:
            yearly = with_device(lambda d: d.get_yearly_energy())
        except Exception:
            yearly = None

        data = []
        if yearly and "current" in yearly:
            c = yearly["current"]
            now = datetime.now()
            data.append({
                "date": f"{now.year}-YTD",
                "hp_heat": c.get("hp_heat", 0),
                "cooling": c.get("cooling", 0),
                "elec_heat": c.get("elec_heat", 0),
                "fan": 0,
                "reheat": 0,
            })
        if yearly and "previous" in yearly:
            p = yearly["previous"]
            data.insert(0, {
                "date": f"{datetime.now().year - 1}",
                "hp_heat": p.get("hp_heat", 0),
                "cooling": p.get("cooling", 0),
                "elec_heat": p.get("elec_heat", 0),
                "fan": p.get("fan", 0),
                "reheat": 0,
            })
        return json_response({"range": "year", "data": data})

    return json_response({"error": "Invalid range"}, 400)


# ── Energy REST API ──────────────────────────────────────────────────

@app.route("/api/energy/daily", methods=["GET"])
def api_energy_daily():
    """Get daily energy breakdown from thermostat.

    Query params:
        days (int): number of past days to return (default 7, max 30)

    Returns: { data: [{ date, hp_heat, cooling, elec_heat, fan, reheat, total }] }
    """
    days_count = min(int(request.args.get("days", 7)), 30)
    history = load_energy_history()

    result = []
    for i in range(1, days_count + 1):
        date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        if date in history:
            d = history[date]
            total = sum(d.get(k, 0) for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"])
            result.append({"date": date, **d, "total": total})

    return json_response({"data": result})


@app.route("/api/energy/yearly", methods=["GET"])
def api_energy_yearly():
    """Get yearly energy totals from thermostat.

    Returns: { current_year, previous_year, data: { current: {...}, previous: {...} } }
    """
    try:
        yearly = with_device(lambda d: d.get_yearly_energy())
    except Exception:
        yearly = None

    if not yearly:
        return json_response({"error": "Could not read yearly energy"}, 500)

    now = datetime.now()
    current = yearly.get("current", {})
    previous = yearly.get("previous", {})

    cur_total = sum(current.get(k, 0) for k in ["hp_heat", "elec_heat", "cooling"])
    prev_total = sum(previous.get(k, 0) for k in ["hp_heat", "elec_heat", "cooling", "fan"])

    return json_response({
        "current_year": now.year,
        "previous_year": now.year - 1,
        "data": {
            "current": {**current, "total": cur_total},
            "previous": {**previous, "total": prev_total},
        },
    })


@app.route("/api/energy/summary", methods=["GET"])
def api_energy_summary():
    """Get energy summary: yesterday, last 7 days, YTD.

    Query params:
        cost_per_kwh (float): $/kWh for cost calculation (default from settings)

    Returns: { yesterday, last_7_days, ytd, cost_per_kwh }
    """
    settings = load_settings()
    cost = float(request.args.get("cost_per_kwh", settings.get("cost_per_kwh", 0.12)))

    # Yesterday
    history = load_energy_history()
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    yesterday_kwh = 0
    if yesterday in history:
        d = history[yesterday]
        yesterday_kwh = sum(d.get(k, 0) for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"])

    # Last 7 days
    week_kwh = 0
    for i in range(1, 8):
        date = (datetime.now() - timedelta(days=i)).strftime("%Y-%m-%d")
        if date in history:
            week_kwh += sum(history[date].get(k, 0) for k in ["hp_heat", "cooling", "elec_heat", "fan", "reheat"])

    # YTD
    ytd_kwh = 0
    try:
        yearly = with_device(lambda d: d.get_yearly_energy())
        if yearly and "current" in yearly:
            c = yearly["current"]
            ytd_kwh = sum(c.get(k, 0) for k in ["hp_heat", "elec_heat", "cooling"])
    except Exception:
        pass

    return json_response({
        "yesterday": {"kwh": yesterday_kwh, "cost": round(yesterday_kwh * cost, 2)},
        "last_7_days": {"kwh": week_kwh, "cost": round(week_kwh * cost, 2)},
        "ytd": {"kwh": ytd_kwh, "cost": round(ytd_kwh * cost, 2)},
        "cost_per_kwh": cost,
    })


@app.route("/api/settings", methods=["GET"])
def api_settings_get():
    return json_response(load_settings())


@app.route("/api/settings", methods=["POST"])
def api_settings_save():
    data = request.get_json()
    updated = save_settings(data)
    return json_response({"ok": True, **updated})


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Carrier Infinity Control Panel")
    parser.add_argument("--mock", action="store_true", help="Run with mock device (no USB adapter needed)")
    args = parser.parse_args()

    _mock_mode = args.mock
    if _mock_mode:
        print("Running in MOCK mode — no real device connected")

    load_schedule()

    # Start background threads
    threading.Thread(target=scheduler_loop, daemon=True).start()
    threading.Thread(target=energy_collector_loop, daemon=True).start()
    threading.Thread(target=ring_polling_loop, daemon=True).start()
    threading.Thread(target=weather_polling_loop, daemon=True).start()

    print("Starting Carrier Infinity control panel...")
    print("Open http://localhost:5050")
    app.run(host="0.0.0.0", port=5050, debug=False)
