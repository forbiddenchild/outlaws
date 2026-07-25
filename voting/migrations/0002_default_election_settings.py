from django.db import migrations


def create_default_election_settings(apps, schema_editor):
    ElectionSetting = apps.get_model('voting', 'ElectionSetting')
    from django.utils import timezone
    from datetime import timedelta

    now = timezone.now()
    ElectionSetting.objects.update_or_create(
        key='election_start_time',
        defaults={'value': now.isoformat()}
    )
    ElectionSetting.objects.update_or_create(
        key='election_end_time',
        defaults={'value': (now + timedelta(days=180)).isoformat()}
    )


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_election_settings, reverse_code=migrations.RunPython.noop),
    ]
