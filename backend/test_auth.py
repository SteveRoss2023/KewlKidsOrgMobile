#!/usr/bin/env python
"""Test authentication endpoints"""
import requests
import json

BASE_URL = "http://localhost:8900/api"

def test_health_check():
    """Test health check endpoint"""
    print("\n1. Testing Health Check...")
    try:
        response = requests.get(f"{BASE_URL}/health/")
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"   Error: {e}")
        return False

def test_register():
    """Test registration endpoint"""
    print("\n2. Testing Registration...")
    data = {
        "email": "test@example.com",
        "password": "testpass123",
        "password2": "testpass123",
        "display_name": "Test User"
    }
    try:
        response = requests.post(f"{BASE_URL}/auth/register/", json=data)
        if response.status_code == 201:
            result = response.json()
            print(f"   [OK] Registration successful!")
            print(f"   Access token: {result.get('access', '')[:30]}...")
            print(f"   Email: {result.get('email', '')}")
            return result.get('access'), result.get('refresh')
        else:
            print(f"   [FAIL] Registration failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None, None
    except Exception as e:
        print(f"   Error: {e}")
        return None, None

def test_login():
    """Test login endpoint"""
    print("\n3. Testing Login...")
    data = {
        "email": "test@example.com",
        "password": "testpass123"
    }
    try:
        response = requests.post(f"{BASE_URL}/auth/login/", json=data)
        if response.status_code == 200:
            result = response.json()
            print(f"   [OK] Login successful!")
            print(f"   Access token: {result.get('access', '')[:30]}...")
            if 'user' in result:
                print(f"   User: {result['user'].get('email', '')}")
            return result.get('access'), result.get('refresh')
        else:
            print(f"   [FAIL] Login failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return None, None
    except Exception as e:
        print(f"   Error: {e}")
        return None, None

def test_refresh(refresh_token):
    """Test token refresh endpoint"""
    print("\n4. Testing Token Refresh...")
    if not refresh_token:
        print("   Skipped (no refresh token)")
        return False
    data = {
        "refresh": refresh_token
    }
    try:
        response = requests.post(f"{BASE_URL}/auth/refresh/", json=data)
        if response.status_code == 200:
            result = response.json()
            print(f"   [OK] Token refresh successful!")
            print(f"   New access token: {result.get('access', '')[:30]}...")
            return True
        else:
            print(f"   [FAIL] Refresh failed: {response.status_code}")
            print(f"   Response: {response.text}")
            return False
    except Exception as e:
        print(f"   Error: {e}")
        return False

def test_duplicate_register():
    """Test duplicate registration (should fail)"""
    print("\n5. Testing Duplicate Registration (should fail)...")
    data = {
        "email": "test@example.com",
        "password": "testpass123",
        "password2": "testpass123"
    }
    try:
        response = requests.post(f"{BASE_URL}/auth/register/", json=data)
        if response.status_code == 400:
            print(f"   [OK] Correctly rejected duplicate email")
            error = response.json()
            if 'email' in error:
                print(f"   Error message: {error['email'][0]}")
            return True
        else:
            print(f"   [FAIL] Should have failed but got: {response.status_code}")
            return False
    except Exception as e:
        print(f"   Error: {e}")
        return False

if __name__ == "__main__":
    print("=" * 50)
    print("Testing Authentication Endpoints")
    print("=" * 50)
    
    # Test health check
    test_health_check()
    
    # Test registration
    access_token, refresh_token = test_register()
    
    # Test login
    login_access, login_refresh = test_login()
    
    # Test refresh
    if login_refresh:
        test_refresh(login_refresh)
    
    # Test duplicate registration
    test_duplicate_register()
    
    print("\n" + "=" * 50)
    print("Testing Complete")
    print("=" * 50)
