import json
import os

from django.db import migrations


def load_voter_seed(apps, schema_editor):
    Voter = apps.get_model('voting', 'Voter')

    if Voter.objects.exists():
        return

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    seed_file = os.path.join(base_dir, 'voters_seed.json')

    if not os.path.exists(seed_file):
        return

    with open(seed_file, 'r', encoding='utf-8') as handle:
        try:
            records = json.load(handle)
        except json.JSONDecodeError:
            return

    for record in records:
        full_name = str(record.get('fullName') or record.get('full_name') or '').strip()
        password = str(record.get('password') or record.get('uniqueId') or '').strip()
        if not full_name or not password:
            continue
        Voter.objects.get_or_create(full_name=full_name, defaults={'password': password})


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0002_default_election_settings'),
    ]

    operations = [
        migrations.RunPython(load_voter_seed, reverse_code=migrations.RunPython.noop),
    ]
