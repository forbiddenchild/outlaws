#!/bin/sh
set -eu

python manage.py migrate --no-input
exec gunicorn outlaws.wsgi:application --bind "0.0.0.0:${PORT:-8000}"
