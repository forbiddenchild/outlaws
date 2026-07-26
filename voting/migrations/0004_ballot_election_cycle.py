from django.db import migrations, models


def create_election_cycle_setting(apps, schema_editor):
    ElectionSetting = apps.get_model('voting', 'ElectionSetting')
    ElectionSetting.objects.get_or_create(key='election_cycle', defaults={'value': '1'})


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0003_seed_voters'),
    ]

    operations = [
        migrations.AddField(
            model_name='ballot',
            name='election_cycle',
            field=models.PositiveIntegerField(db_index=True, default=1),
        ),
        migrations.RunPython(create_election_cycle_setting, migrations.RunPython.noop),
    ]
