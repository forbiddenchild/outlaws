from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0004_ballot_election_cycle'),
    ]

    operations = [
        migrations.AddField(
            model_name='contestant',
            name='photo_public_id',
            field=models.CharField(blank=True, max_length=1024),
        ),
    ]
