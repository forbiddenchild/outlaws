from django.db import migrations


def move_kiyimba_to_publicity_secretary(apps, schema_editor):
    Position = apps.get_model('voting', 'Position')
    Contestant = apps.get_model('voting', 'Contestant')

    publicity_secretary = Position.objects.get(key='publicity_secretary')
    contestant = Contestant.objects.filter(name='Kiyimba Davis').first()

    if contestant:
        contestant.position = publicity_secretary
        contestant.photo_path = '/contestants/publicity secretary/Kiyimba Davis.jpeg'
        contestant.save(update_fields=['position', 'photo_path'])
    else:
        Contestant.objects.create(
            name='Kiyimba Davis',
            position=publicity_secretary,
            photo_path='/contestants/publicity secretary/Kiyimba Davis.jpeg',
        )


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0007_seed_initial_contestant'),
    ]

    operations = [
        migrations.RunPython(move_kiyimba_to_publicity_secretary, migrations.RunPython.noop),
    ]
