from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0005_contestant_photo_public_id'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='contestant',
            name='photo_public_id',
        ),
    ]
