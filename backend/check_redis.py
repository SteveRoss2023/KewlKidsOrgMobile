#!/usr/bin/env python
"""
Script to validate Redis setup for Django Channels.
"""
import os
import sys
import django

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

def check_redis():
    """Check if Redis is properly configured and accessible."""
    print("=" * 60)
    print("Redis Configuration Validation")
    print("=" * 60)

    # Check 1: Required packages
    print("\n1. Checking required packages...")
    try:
        import channels_redis
        print(f"   [OK] channels-redis installed: {channels_redis.__version__}")
    except ImportError:
        print("   [FAIL] channels-redis NOT installed")
        print("   Run: pip install channels-redis")
        return False

    try:
        import redis
        print(f"   [OK] redis package installed: {redis.__version__}")
    except ImportError:
        print("   [FAIL] redis package NOT installed")
        print("   Run: pip install redis")
        return False

    # Check 2: Configuration
    print("\n2. Checking Django configuration...")
    from django.conf import settings

    if hasattr(settings, 'CHANNEL_LAYERS'):
        channel_backend = settings.CHANNEL_LAYERS.get('default', {}).get('BACKEND', '')
        if 'redis' in channel_backend.lower():
            print(f"   [OK] CHANNEL_LAYERS configured: {channel_backend}")
            config = settings.CHANNEL_LAYERS.get('default', {}).get('CONFIG', {})
            hosts = config.get('hosts', [])
            if hosts:
                host, port = hosts[0]
                print(f"   [OK] Redis host: {host}:{port}")
            else:
                print("   [FAIL] No Redis hosts configured")
                return False
        else:
            print(f"   [WARN] CHANNEL_LAYERS using: {channel_backend}")
            print("   [WARN] Not using Redis - WebSockets may not work properly")
    else:
        print("   [FAIL] CHANNEL_LAYERS not configured")
        return False

    # Check 3: Redis connection
    print("\n3. Testing Redis connection...")
    try:
        import redis as redis_client
        from django.conf import settings

        config = settings.CHANNEL_LAYERS.get('default', {}).get('CONFIG', {})
        hosts = config.get('hosts', [])
        if hosts:
            host, port = hosts[0]

            try:
                r = redis_client.Redis(host=host, port=port, db=0, socket_connect_timeout=2)
                r.ping()
                print(f"   [OK] Redis connection successful: {host}:{port}")

                # Check Redis info
                info = r.info()
                print(f"   [OK] Redis version: {info.get('redis_version', 'unknown')}")
                print(f"   [OK] Redis mode: {info.get('redis_mode', 'unknown')}")

            except redis_client.ConnectionError as e:
                print(f"   [FAIL] Cannot connect to Redis at {host}:{port}")
                print(f"   Error: {e}")
                print("\n   Troubleshooting:")
                print("   1. Make sure Redis is running:")
                print("      - Windows: redis-server (or wsl redis-server)")
                print("      - Mac: brew services start redis")
                print("      - Linux: sudo systemctl start redis")
                print("   2. Check if Redis is listening on the correct port")
                print("   3. Check firewall settings")
                return False
            except Exception as e:
                print(f"   [FAIL] Error connecting to Redis: {e}")
                return False
        else:
            print("   [FAIL] No Redis hosts configured")
            return False

    except Exception as e:
        print(f"   [FAIL] Error testing Redis connection: {e}")
        return False

    # Check 4: Channels layer
    print("\n4. Testing Channels layer...")
    try:
        from channels.layers import get_channel_layer
        channel_layer = get_channel_layer()
        if channel_layer:
            print(f"   [OK] Channel layer initialized: {type(channel_layer).__name__}")

            # Try a simple operation
            import asyncio
            async def test_layer():
                try:
                    # This will fail if Redis is not accessible
                    await channel_layer.send('test_channel', {'type': 'test'})
                    return True
                except Exception as e:
                    print(f"   [WARN] Channel layer test failed: {e}")
                    return False

            result = asyncio.run(test_layer())
            if result:
                print("   [OK] Channel layer is functional")
            else:
                print("   [WARN] Channel layer test failed (may still work)")
        else:
            print("   [FAIL] Channel layer not initialized")
            return False
    except Exception as e:
        print(f"   [FAIL] Error testing channel layer: {e}")
        return False

    print("\n" + "=" * 60)
    print("[OK] All Redis checks passed!")
    print("=" * 60)
    return True

if __name__ == '__main__':
    success = check_redis()
    sys.exit(0 if success else 1)

