"""Server-only credential settings; values never enter audit/model context."""

import os

from app.db import PROJECT_ROOT


def tuning_settings(default_model=None):
    values = {}
    source = PROJECT_ROOT / '.env'
    if source.exists():
        for line in source.read_text(encoding='utf-8-sig').splitlines():
            key, separator, value = line.partition('=')
            key = key.strip()
            if separator and key in ('CODEX_API_KEY', 'CODEX_MODEL'):
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                values[key] = value
    return {'api_key': os.environ.get('CODEX_API_KEY', values.get('CODEX_API_KEY')),
            'model': os.environ.get('CODEX_MODEL', values.get('CODEX_MODEL', default_model))}
