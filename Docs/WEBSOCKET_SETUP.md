# WebSocket Setup Guide

This guide explains how to set up and run the Django backend with WebSocket support for real-time chat features.

## Prerequisites

1. **Redis** must be installed and running
2. **Daphne** must be installed (included in requirements.txt)
3. **Django Channels** must be installed (included in requirements.txt)

## Installing Redis

### Windows

**Option 1: Using WSL (Windows Subsystem for Linux)**
```powershell
wsl
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

**Option 2: Using Chocolatey**
```powershell
choco install redis-64
redis-server
```

**Option 3: Download from GitHub**
- Download from: https://github.com/microsoftarchive/redis/releases
- Extract and run `redis-server.exe`

### Mac (Homebrew)

```bash
brew install redis
brew services start redis
# Or run directly:
redis-server
```

### Linux

```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
# Or run directly:
redis-server
```

## Verifying Redis is Running

```bash
redis-cli ping
# Should return: PONG
```

## Running the Server with WebSocket Support

### Windows

```powershell
cd backend
.\venv\Scripts\activate
.\rundaphne.bat
```

### Mac/Linux

```bash
cd backend
source venv/bin/activate
chmod +x rundaphne.sh
./rundaphne.sh
```

### Manual Command

```bash
daphne -b 0.0.0.0 -p 8900 config.asgi:application
```

## Configuration

The WebSocket configuration is in `backend/config/settings.py`:

```python
# Channels Configuration (for WebSockets)
ASGI_APPLICATION = 'config.asgi.application'

# Redis configuration for Channels
CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [(os.getenv('REDIS_HOST', 'localhost'), int(os.getenv('REDIS_PORT', '6379')))],
        },
    },
}
```

## Troubleshooting

### WebSocket Connection Fails

1. **Check Redis is running:**
   ```bash
   redis-cli ping
   ```

2. **Check Daphne is installed:**
   ```bash
   pip list | grep daphne
   ```

3. **Check Channels is installed:**
   ```bash
   pip list | grep channels
   ```

4. **Verify ASGI configuration:**
   - Check `backend/config/asgi.py` exists and is properly configured
   - Check `backend/chat/routing.py` has WebSocket routes

5. **Check server logs:**
   - Look for errors in the Daphne console output
   - Check for Redis connection errors

### Redis Connection Error

If you see errors like "Error connecting to Redis", try:

1. **Check Redis is listening on the correct port:**
   ```bash
   redis-cli -p 6379 ping
   ```

2. **Check firewall settings** (if Redis is on a different machine)

3. **Use environment variables** to configure Redis host/port:
   ```bash
   export REDIS_HOST=localhost
   export REDIS_PORT=6379
   ```

### Fallback to In-Memory Layer

If Redis is not available, you can temporarily use in-memory channel layer (not recommended for production):

1. Edit `backend/config/settings.py`
2. Comment out the Redis CHANNEL_LAYERS configuration
3. Uncomment the InMemoryChannelLayer configuration

**Note:** In-memory layer only works with a single server instance and doesn't persist across restarts.

## Testing WebSocket Connection

1. Start the server with Daphne
2. Open the chat feature in the mobile app
3. Check browser console for WebSocket connection messages
4. Try sending a message - it should appear in real-time

## Production Deployment

For production, ensure:

1. Redis is running as a service
2. Daphne is configured to run as a service (systemd, supervisor, etc.)
3. WebSocket proxy is configured (nginx, etc.) to handle WebSocket upgrades
4. Redis persistence is configured for data durability



