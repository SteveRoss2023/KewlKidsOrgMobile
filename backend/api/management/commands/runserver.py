"""
Custom runserver command that defaults to port 8900.
"""
from django.core.management.commands.runserver import Command as BaseRunserverCommand


class Command(BaseRunserverCommand):
    default_port = '8900'

