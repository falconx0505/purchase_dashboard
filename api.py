# testing script to test the api for kyc


import json
import requests

BASE_DOMAIN = "https://kycapi.microvistatech.com"
TOKEN_ID = "S3DHQ7FB"
TOKEN_SECRET = "6DNDJSLFXE87"


def get_bearer_token() -> str:
    """Step 1: Generate Authorization Bearer Token"""
    auth_url = f"{BASE_DOMAIN}/api/Auth/GenerateAuthtoken"
    auth_params = {
        "TokenID": TOKEN_ID,
        "TokenSecret": TOKEN_SECRET
    }

    resp = requests.get(auth_url, params=auth_params)
    if resp.status_code != 200:
        print(f"Auth Request Failed [HTTP {resp.status_code}]: {resp.text}")
        return None

    try:
        data = resp.json()
        return data.get("Data", {}).get("Token") or data.get("token")
    except json.JSONDecodeError:
        print(f"Auth Endpoint returned non-JSON response: {resp.text}")
        return None


def verify_pan_kyc(pan_number: str):
    token = get_bearer_token()
    if not token:
        print("Aborting: Could not obtain bearer token.")
        return

    print("Bearer token retrieved successfully.")

    headers = {
        "Authorization": f"Bearer {token}"
    }
    verify_params = {
        "pan": pan_number,
        "TokenID": TOKEN_ID,
        "TokenSecret": TOKEN_SECRET,
        "IsFromExcel": False
    }

    # Candidate URL paths to test
    url_candidates = [
        f"{BASE_DOMAIN}/api/v1/AdvancePanVerification/VerifyPan",
        f"{BASE_DOMAIN}/api/AdvancePanVerification/VerifyPan"
    ]

    for verify_url in url_candidates:
        print(f"Calling endpoint: {verify_url}")
        response = requests.get(verify_url, headers=headers, params=verify_params)
        print(f"HTTP Status Code: {response.status_code}")

        if response.status_code == 200:
            try:
                return response.json()
            except json.JSONDecodeError:
                print("Response code was 200 but payload was not valid JSON.")
        elif response.status_code != 404:
            print(f"Server response: {response.text[:300]}")
            break

    print("All endpoint URL attempts failed.")
    return None


# if __name__ == "__main__":
#     pan_to_test = "MHBPS3464E"
#     output_data = verify_pan_kyc(pan_to_test)
#     if output_data:
#         print("\n--- PAN VERIFICATION RESULT ---")
#         print(json.dumps(output_data, indent=2))



        #MHBPS3464E