# WebSocket Setup Guide

This guide explains how to run the Django backend with WebSocket support for real-time chat.

## Default: no Redis (`USE_REDIS=False`)

Chat uses Django Channels with an **in-memory** channel layer. Same chat UI and WebSockets; fine for single-user / one Django process (personal testing).

In `backend/.env`:

```env
USE_REDIS=False
```

No Redis install, Docker Redis, or `redis-server` required. Restart the backend after changing this flag.

**Limits:** One server process only. Do not run multiple Daphne workers with in-memory channels.

## Later: Redis for multi-user / production (`USE_REDIS=True`)

When you need multiple processes or machines:

```env
USE_REDIS=True
# REDIS_HOST=localhost
# REDIS_PORT=6379
# REDIS_URL=redis://localhost:6379/1
```

Then install and start Redis (below). Packages `channels-redis` and `redis` stay in `requirements.txt` for this path.

### Installing Redis

#### Windows

**Option 1: WSL**
```powershell
wsl
sudo apt-get update
sudo apt-get install redis-server
redis-server
```

**Option 2: Chocolatey**
```powershell
choco install redis-64
redis-server
```

**Option 3: Download**
- https://github.com/microsoftarchive/redis/releases
- Extract and run `redis-server.exe`

#### Mac (Homebrew)

```bash
brew install redis
brew services start redis
```

#### Linux

```bash
sudo apt-get update
sudo apt-get install redis-server
sudo systemctl start redis
```

### Verifying Redis

```bash
redis-cli ping
# Should return: PONG
```

## Running the server with WebSocket support

### Windows

```powershell
cd backend
.\venv\Scripts\activate
python manage.py runserver
# Or: .\rundaphne.bat
```

### Mac/Linux

```bash
cd backend
source venv/bin/activate
python manage.py runserver
# Or: ./rundaphne.sh
```

### Manual Daphne

```bash
daphne -b 0.0.0.0 -p 8900 config.asgi:application
```

## Configuration

[`backend/config/settings.py`](../backend/config/settings.py) switches on `USE_REDIS`:

- `False` → `channels.layers.InMemoryChannelLayer` + LocMem cache
- `True` → `channels_redis` + Redis cache at `REDIS_URL`

## Troubleshooting

### WebSocket connection fails

1. Confirm backend is running with Daphne/ASGI (`runserver` with Channels, or `daphne`)
2. Check `backend/config/asgi.py` and `backend/chat/routing.py`
3. Check server logs for channel-layer errors
4. If `USE_REDIS=True`, verify Redis: `redis-cli ping`

### Redis connection error (only when `USE_REDIS=True`)

1. `redis-cli -p 6379 ping`
2. Or set `USE_REDIS=False` and restart for single-process mode

## Testing

1. Start the backend (`USE_REDIS=False` is enough)
2. Open chat in the app
3. Send a message; it should appear in real time
