#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys


def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc

    # Override default port for runserver to 8900
    if len(sys.argv) > 1 and sys.argv[1] == 'runserver':
        if len(sys.argv) == 2:
            # No port specified, default to 0.0.0.0:8900
            sys.argv.append('0.0.0.0:8900')
        elif len(sys.argv) == 3 and ':' not in sys.argv[2]:
            # Only port number specified, add 0.0.0.0
            sys.argv[2] = f'0.0.0.0:{sys.argv[2]}'

    execute_from_command_line(sys.argv)


if __name__ == '__main__':
    main()

