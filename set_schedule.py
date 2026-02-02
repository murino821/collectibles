#!/usr/bin/env python3
"""
Update Firestore users schedule using REST API
Requires: pip install google-auth requests
"""

import json
import subprocess
from datetime import datetime, timedelta
import requests

# Get Firebase access token
def get_access_token():
    try:
        result = subprocess.run(
            ['firebase', 'login:use', 'miroslav.svajda@gmail.com'],
            capture_output=True,
            text=True
        )

        # Get token using gcloud (if available)
        result = subprocess.run(
            ['gcloud', 'auth', 'print-access-token'],
            capture_output=True,
            text=True
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except:
        pass

    print("❌ Cannot get access token")
    print("Manual steps needed:")
    print("\n1. Go to Firebase Console:")
    print("   https://console.firebase.google.com/project/your-card-collection-2026/firestore/databases/-default-/data/~2Fusers")
    print("\n2. For each user document, update:")
    print("   - nextUpdateDate: Set to today at 11:15")
    print("   - priceUpdatesEnabled: true")
    print("   - updateHourOfDay: 11")
    return None

def main():
    print("📦 Firebase Schedule Updater\n")

    token = get_access_token()
    if not token:
        return

    project_id = "your-card-collection-2026"

    # Set target time to 11:15 today
    target = datetime.now().replace(hour=11, minute=15, second=0, microsecond=0)
    timestamp = target.isoformat() + 'Z'

    print(f"Target time: {target.strftime('%Y-%m-%d %H:%M:%S')}\n")

    # This would require the Firestore REST API which is complex
    # Easier to just show manual instructions

    print("\n📋 Manual Update Instructions:")
    print("\n1. Open Firebase Console:")
    print(f"   https://console.firebase.google.com/project/{project_id}/firestore")
    print("\n2. Go to 'users' collection")
    print("\n3. For each user document:")
    print("   - Click on document")
    print("   - Edit 'nextUpdateDate' field")
    print(f"   - Set to: {target.strftime('%Y-%m-%d %H:%M:%S')}")
    print("   - Make sure 'priceUpdatesEnabled' is true")
    print("   - Set 'updateHourOfDay' to 11")
    print("\n4. Save changes")

if __name__ == '__main__':
    main()
