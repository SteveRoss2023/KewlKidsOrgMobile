"""
Custom runserver command that defaults to port 8900 and listens on all interfaces.
"""
from django.core.management.commands.runserver import Command as BaseRunserverCommand


class Command(BaseRunserverCommand):
    default_port = '8900'
    default_addr = '0.0.0.0'  # Listen on all interfaces (allows phone to connect)
