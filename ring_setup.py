#!/usr/bin/env python3
"""One-time Ring alarm authentication setup.

Usage:
  1. Create a .env file with RING_EMAIL and RING_PASSWORD
  2. Run: python3 ring_setup.py
  3. Enter the 2FA code when prompted
  4. Token saved to ring_auth.json (auto-refreshes)
"""

import asyncio
import json
import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
except ImportError:
    print("Install python-dotenv: pip install python-dotenv")
    sys.exit(1)

try:
    from ring_doorbell import Auth, Ring
    from ring_doorbell.exceptions import Requires2FAError
except ImportError:
    print("Install ring-doorbell: pip install ring-doorbell")
    sys.exit(1)

AUTH_FILE = Path(__file__).parent / "ring_auth.json"
ENV_FILE = Path(__file__).parent / ".env"


def token_updated(token):
    AUTH_FILE.write_text(json.dumps(token))
    print(f"Token saved to {AUTH_FILE}")


async def main():
    if not ENV_FILE.exists():
        print("Create a .env file with:")
        print("  RING_EMAIL=your@email.com")
        print("  RING_PASSWORD=yourpassword")
        sys.exit(1)

    load_dotenv(ENV_FILE)
    email = os.getenv("RING_EMAIL")
    password = os.getenv("RING_PASSWORD")

    if not email or not password:
        print("RING_EMAIL and RING_PASSWORD must be set in .env")
        sys.exit(1)

    print(f"Authenticating as {email}...")

    auth = Auth("CarrierControl/1.0", None, token_updated)

    try:
        await auth.async_fetch_token(email, password)
    except Requires2FAError:
        code = input("Enter 2FA code sent to your device: ").strip()
        try:
            await auth.async_fetch_token(email, password, code)
        except Exception as e2:
            print(f"Auth failed with 2FA: {e2}")
            await auth.async_close()
            sys.exit(1)
    except Exception as e:
        err_str = str(e)
        if "2fa" in err_str.lower() or "verification" in err_str.lower() or "Requires2FA" in err_str:
            code = input("Enter 2FA code sent to your device: ").strip()
            try:
                await auth.async_fetch_token(email, password, code)
            except Exception as e2:
                print(f"Auth failed with 2FA: {e2}")
                await auth.async_close()
                sys.exit(1)
        else:
            print(f"Auth failed: {e}")
            await auth.async_close()
            sys.exit(1)

    # Verify connection
    ring = Ring(auth)
    await ring.async_update_data()
    devices = ring.devices()

    print("\nAuthentication successful!")
    print(f"Token saved to {AUTH_FILE}")

    # Show devices
    panels = devices.get("security_panels", [])
    if panels:
        for p in panels:
            mode = await p.async_get_mode() if hasattr(p, 'async_get_mode') else getattr(p, 'mode', 'unknown')
            print(f"  Security Panel: {p.name} (mode: {mode})")
    else:
        print("  No security panels found")
        print(f"  Available device types: {list(devices.keys())}")

    await auth.async_close()
    print("\nDone! The server will use this token automatically.")


if __name__ == "__main__":
    asyncio.run(main())
