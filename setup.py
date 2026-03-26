#!/usr/bin/env python3
"""Pyfinity setup wizard. Configures all integrations interactively.

Usage: python3 setup.py [--ring] [--weather] [--all]
  No args = guided menu
"""

import asyncio
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).parent
RING_AUTH_FILE = BASE_DIR / "ring_auth.json"
SETTINGS_FILE = BASE_DIR / "settings.json"


# ── Helpers ──────────────────────────────────────────────────────────

def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        try:
            return json.loads(SETTINGS_FILE.read_text())
        except Exception:
            pass
    return {}


def save_settings(updates: dict):
    current = load_settings()
    current.update(updates)
    SETTINGS_FILE.write_text(json.dumps(current, indent=2))


def green(s): return f"\033[32m{s}\033[0m"
def yellow(s): return f"\033[33m{s}\033[0m"
def red(s): return f"\033[31m{s}\033[0m"
def bold(s): return f"\033[1m{s}\033[0m"


# ── Ring setup ───────────────────────────────────────────────────────

async def setup_ring():
    print(f"\n{bold('Ring Alarm')}")
    print("-" * 40)

    # Check current status
    if RING_AUTH_FILE.exists():
        try:
            token = json.loads(RING_AUTH_FILE.read_text())
            if token.get("access_token"):
                print(f"  Status: {green('configured')}")
                loc = token.get("location_id", "unknown")
                print(f"  Location ID: {loc}")
                ans = input("  Re-authenticate? [y/N] ").strip().lower()
                if ans != "y":
                    return True
        except Exception:
            pass

    try:
        from ring_doorbell import Auth, Ring
        from ring_doorbell.exceptions import Requires2FAError
    except ImportError:
        print(f"  {red('ring_doorbell not installed')}")
        print("  Run: pip install ring-doorbell")
        return False

    email = input("  Ring email: ").strip()
    if not email:
        print("  Skipped.")
        return False

    import getpass
    password = getpass.getpass("  Ring password: ")
    if not password:
        print("  Skipped.")
        return False

    def token_updated(token):
        RING_AUTH_FILE.write_text(json.dumps(token))

    auth = Auth("CarrierControl/1.0", None, token_updated)

    print(f"  Authenticating as {email}...")
    try:
        await auth.async_fetch_token(email, password)
    except (Requires2FAError, Exception) as e:
        if isinstance(e, Requires2FAError) or "2fa" in str(e).lower() or "verification" in str(e).lower():
            code = input("  2FA code: ").strip()
            try:
                await auth.async_fetch_token(email, password, code)
            except Exception as e2:
                print(f"  {red(f'Auth failed: {e2}')}")
                await auth.async_close()
                return False
        else:
            print(f"  {red(f'Auth failed: {e}')}")
            await auth.async_close()
            return False

    # Verify and show devices
    ring = Ring(auth)
    await ring.async_update_data()
    devices = ring.devices()

    panels = devices.get("security_panels", [])
    if panels:
        for p in panels:
            mode = await p.async_get_mode() if hasattr(p, "async_get_mode") else "unknown"
            print(f"  Found: {p.name} (mode: {mode})")
    else:
        print(f"  {yellow('No security panels found')}")
        print(f"  Device types: {list(devices.keys())}")

    await auth.async_close()
    print(f"  {green('Ring configured!')}")
    return True


# ── Weather setup ────────────────────────────────────────────────────

def setup_weather():
    print(f"\n{bold('OpenWeatherMap')}")
    print("-" * 40)

    settings = load_settings()
    city = settings.get("city", "")
    api_key = settings.get("openweather_api_key", "")

    if city and api_key:
        print(f"  Status: {green('configured')}")
        print(f"  City: {city}")
        print(f"  API key: {api_key[:8]}...")
        ans = input("  Reconfigure? [y/N] ").strip().lower()
        if ans != "y":
            return True

    print("  Get a free API key at: https://openweathermap.org/api")
    new_key = input(f"  API key [{api_key[:8] + '...' if api_key else 'none'}]: ").strip()
    new_city = input(f"  City [{city or 'none'}]: ").strip()

    if new_key or new_city:
        updates = {}
        if new_key:
            updates["openweather_api_key"] = new_key
        if new_city:
            updates["city"] = new_city
        save_settings(updates)
        print(f"  {green('Weather configured!')}")
        return True

    if city and api_key:
        return True

    print("  Skipped.")
    return False


# ── Menu ─────────────────────────────────────────────────────────────

def show_status():
    print(f"\n{bold('Pyfinity Setup')}")
    print("=" * 40)

    # Ring status
    ring_ok = False
    if RING_AUTH_FILE.exists():
        try:
            t = json.loads(RING_AUTH_FILE.read_text())
            ring_ok = bool(t.get("access_token"))
        except Exception:
            pass
    print(f"  1. Ring Alarm     {green('configured') if ring_ok else yellow('not configured')}")

    # Weather status
    settings = load_settings()
    weather_ok = bool(settings.get("city") and settings.get("openweather_api_key"))
    print(f"  2. Weather        {green('configured') if weather_ok else yellow('not configured')}")

    print(f"  3. Setup all")
    print(f"  q. Quit")
    return ring_ok, weather_ok


async def main():
    args = sys.argv[1:]

    # Direct flags
    if "--ring" in args:
        await setup_ring()
        return
    if "--weather" in args:
        setup_weather()
        return
    if "--all" in args:
        await setup_ring()
        setup_weather()
        return

    # Interactive menu
    while True:
        ring_ok, weather_ok = show_status()
        print()
        choice = input("  Choose [1/2/3/q]: ").strip().lower()

        if choice == "1":
            await setup_ring()
        elif choice == "2":
            setup_weather()
        elif choice == "3":
            await setup_ring()
            setup_weather()
        elif choice in ("q", ""):
            break
        else:
            print("  Invalid choice.")

    print()
    if ring_ok or load_settings().get("openweather_api_key"):
        print("Restart the server to pick up changes:")
        print("  sudo systemctl restart pyfinity")
    print()


if __name__ == "__main__":
    asyncio.run(main())
