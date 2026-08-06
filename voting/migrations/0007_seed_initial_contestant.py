from django.db import migrations


def seed_initial_contestants(apps, schema_editor):
    Position = apps.get_model('voting', 'Position')
    Contestant = apps.get_model('voting', 'Contestant')

    seed_data = [
        ('cohort_president', 'Cohort President', 1, 'Ahumuza Job Marvin', 'contestants/cohort president/Ahumuza Job Marvin.jpeg'),
        ('vice_president', 'Vice President', 2, 'Aruho Gary', 'contestants/vice president/Aruho Gary.jpeg'),
        ('vice_president', 'Vice President', 2, 'Kayondo Ernest', 'contestants/vice president/Kayondo Ernest.jpeg'),
        ('vice_president', 'Vice President', 2, 'Matovu Charles', 'contestants/vice president/Matovu Charles.jpeg'),
        ('secretary', 'Secretary', 3, 'Lhusunzo John Mary', 'contestants/secretary/Lhusunzo John Mary.jpeg'),
        ('treasurer', 'Treasurer', 4, 'Kimbugwe Richard', 'contestants/treasurer/Kimbugwe Richard.jpeg'),
        ('publicity_secretary', 'Publicity Secretary', 5, 'Lubega Jerome', 'contestants/publicity secretary/Lubega Jerome.jpeg'),
        ('mobiliser', 'Mobiliser', 6, 'Bocana Optune Tonny', 'contestants/mobiliser/Bocana Optune Tonny.jpeg'),
        ('mobiliser', 'Mobiliser', 6, 'Kiyimba Davis', 'contestants/mobiliser/Kiyimba Davis.jpeg'),
        ('mobiliser', 'Mobiliser', 6, 'Yonnah N', 'contestants/mobiliser/Yonnah N.jpeg'),
    ]

    for key, label, order_idx, name, photo_path in seed_data:
        position, _ = Position.objects.update_or_create(
            key=key,
            defaults={'label': label, 'order_idx': order_idx},
        )
        Contestant.objects.update_or_create(
            name=name,
            position=position,
            defaults={'photo_path': f'/{photo_path}'},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('voting', '0006_remove_contestant_photo_public_id'),
    ]

    operations = [
        migrations.RunPython(seed_initial_contestants, migrations.RunPython.noop),
    ]
