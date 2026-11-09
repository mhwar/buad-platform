"""Temporary App Store signing for CI, through the App Store Connect API (no Mac, no registered devices).

  setup    creates a private key + CSR, an Apple Distribution certificate, and an App Store provisioning
           profile for the bundle id; installs both in a throwaway keychain; writes their ids to $GITHUB_ENV.
  cleanup  revokes that certificate and deletes that profile (always run at the end of the job).

Builds already uploaded to TestFlight stay valid after the certificate is revoked. Only the certificate and
profile this run created are touched; certificates of other apps on the team are never listed or changed.

Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (.p8), BUNDLE_ID, RUNNER_TEMP, GITHUB_ENV, GITHUB_RUN_ID.
"""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt  # pyjwt[crypto]

API = "https://api.appstoreconnect.apple.com/v1"
TMP = os.environ.get("RUNNER_TEMP", "/tmp")
WORK = os.path.join(TMP, "signing")
STATE = os.path.join(WORK, "state.json")
KEYCHAIN = os.path.join(TMP, "buad-signing.keychain-db")


def token():
    now = int(time.time())
    with open(os.environ["ASC_KEY_PATH"]) as f:
        key = f.read()
    return jwt.encode(
        {"iss": os.environ["ASC_ISSUER_ID"], "iat": now, "exp": now + 1000, "aud": "appstoreconnect-v1"},
        key,
        algorithm="ES256",
        headers={"kid": os.environ["ASC_KEY_ID"], "typ": "JWT"},
    )


def api(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token()}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        print(f"::error::App Store Connect API {method} {path} → {e.code}: {detail[:800]}")
        raise SystemExit(1)


def sh(*args, **kw):
    subprocess.run(args, check=True, **kw)


def env_out(**kv):
    with open(os.environ["GITHUB_ENV"], "a") as f:
        for k, v in kv.items():
            f.write(f"{k}={v}\n")


def setup():
    os.makedirs(WORK, exist_ok=True)
    key, csr = os.path.join(WORK, "dist.key"), os.path.join(WORK, "dist.csr")
    sh("openssl", "genrsa", "-out", key, "2048")
    sh("openssl", "req", "-new", "-key", key, "-subj", "/CN=Buad CI/O=Buad/C=SA", "-out", csr)
    with open(csr) as f:
        csr_pem = f.read()

    cert = api("POST", "/certificates", {"data": {"type": "certificates", "attributes": {
        "certificateType": "DISTRIBUTION", "csrContent": csr_pem}}})["data"]
    state = {"certId": cert["id"]}
    with open(STATE, "w") as f:
        json.dump(state, f)
    der = os.path.join(WORK, "dist.cer")
    with open(der, "wb") as f:
        f.write(base64.b64decode(cert["attributes"]["certificateContent"]))
    pem = os.path.join(WORK, "dist.pem")
    sh("openssl", "x509", "-inform", "DER", "-in", der, "-out", pem)
    p12 = os.path.join(WORK, "dist.p12")
    password = "buad-ci"
    sh("openssl", "pkcs12", "-export", "-inkey", key, "-in", pem, "-out", p12, "-passout", f"pass:{password}")

    bundle_id = os.environ["BUNDLE_ID"]
    found = api("GET", "/bundleIds?" + urllib.parse.urlencode({"filter[identifier]": bundle_id, "limit": "200"}))["data"]
    match = [b for b in found if b["attributes"]["identifier"] == bundle_id]
    if not match:
        print(f"::error::Bundle ID {bundle_id} is not registered in this team (developer.apple.com → Identifiers).")
        raise SystemExit(1)

    name = f"Buad CI {os.environ.get('GITHUB_RUN_ID', int(time.time()))}"
    profile = api("POST", "/profiles", {"data": {
        "type": "profiles",
        "attributes": {"name": name, "profileType": "IOS_APP_STORE"},
        "relationships": {
            "bundleId": {"data": {"type": "bundleIds", "id": match[0]["id"]}},
            "certificates": {"data": [{"type": "certificates", "id": cert["id"]}]},
        },
    }})["data"]
    state["profileId"] = profile["id"]
    with open(STATE, "w") as f:
        json.dump(state, f)
    uuid = profile["attributes"]["uuid"]
    content = base64.b64decode(profile["attributes"]["profileContent"])
    for d in ("~/Library/MobileDevice/Provisioning Profiles", "~/Library/Developer/Xcode/UserData/Provisioning Profiles"):
        d = os.path.expanduser(d)
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, f"{uuid}.mobileprovision"), "wb") as f:
            f.write(content)

    kc_pass = "buad-ci-keychain"
    sh("security", "create-keychain", "-p", kc_pass, KEYCHAIN)
    sh("security", "set-keychain-settings", "-lut", "3600", KEYCHAIN)
    sh("security", "unlock-keychain", "-p", kc_pass, KEYCHAIN)
    listed = subprocess.run(["security", "list-keychains", "-d", "user"], capture_output=True, text=True).stdout
    existing = [k.strip().strip('"') for k in listed.split("\n") if k.strip()]
    sh("security", "list-keychains", "-d", "user", "-s", KEYCHAIN, *existing)
    sh("security", "import", p12, "-k", KEYCHAIN, "-P", password, "-T", "/usr/bin/codesign", "-T", "/usr/bin/security")
    sh("security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", kc_pass, KEYCHAIN,
       stdout=subprocess.DEVNULL)

    env_out(PROFILE_NAME=name, PROFILE_UUID=uuid)
    print(f"Temporary certificate {cert['id']} and profile «{name}» ({uuid}) are ready.")


def cleanup():
    if os.path.exists(STATE):
        with open(STATE) as f:
            state = json.load(f)
        if state.get("profileId"):
            api("DELETE", f"/profiles/{state['profileId']}")
            print("Deleted the temporary profile.")
        if state.get("certId"):
            api("DELETE", f"/certificates/{state['certId']}")
            print("Revoked the temporary certificate.")
    subprocess.run(["security", "delete-keychain", KEYCHAIN], check=False)
    subprocess.run(["rm", "-rf", WORK], check=False)


if __name__ == "__main__":
    {"setup": setup, "cleanup": cleanup}[sys.argv[1]]()
