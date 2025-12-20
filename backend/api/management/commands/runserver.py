"""
Custom runserver command that defaults to port 8900 and listens on all interfaces.
This overrides Daphne's runserver command to use port 8900 instead of default 8000.
"""
try:
    # Try to import Daphne's runserver command first
    from daphne.management.commands.runserver import Command as BaseRunserverCommand
except ImportError:
    # Fallback to Django's runserver if Daphne isn't installed
    from django.core.management.commands.runserver import Command as BaseRunserverCommand


class Command(BaseRunserverCommand):
    default_port = '8900'
    default_addr = '0.0.0.0'  # Listen on all interfaces (allows phone to connect)

