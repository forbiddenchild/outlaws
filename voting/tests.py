import json
from datetime import timedelta

from django.conf import settings
from django.test import TestCase
from django.test import override_settings
from django.utils import timezone

from .models import Ballot, Contestant, ElectionSetting, Position, Voter, VoteSelection


@override_settings(
    MIDDLEWARE=[
        middleware
        for middleware in settings.MIDDLEWARE
        if middleware != 'whitenoise.middleware.WhiteNoiseMiddleware'
    ]
)
class VotingApiTests(TestCase):
    def setUp(self):
        now = timezone.now()
        ElectionSetting.objects.update_or_create(
            key='election_start_time', defaults={'value': (now - timedelta(minutes=5)).isoformat()}
        )
        ElectionSetting.objects.update_or_create(
            key='election_end_time', defaults={'value': (now + timedelta(minutes=5)).isoformat()}
        )
        ElectionSetting.objects.update_or_create(key='election_cycle', defaults={'value': '1'})
        self.chair = Position.objects.create(key='chair', label='Chairperson', order_idx=1)
        self.secretary = Position.objects.create(key='secretary', label='Secretary', order_idx=2)
        Contestant.objects.create(name='Alex', position=self.chair)
        Contestant.objects.create(name='Blair', position=self.secretary)
        self.voter = Voter.objects.create(full_name='Taylor Voter', password='voter-1')

    def test_voter_list_does_not_expose_ballot_status(self):
        self.voter.has_voted = True
        self.voter.save(update_fields=['has_voted'])

        response = self.client.get('/api/voters')

        self.assertEqual(response.status_code, 200)
        voter_data = next(item for item in response.json() if item['fullName'] == 'Taylor Voter')
        self.assertEqual(voter_data, {'fullName': 'Taylor Voter'})

    def test_partial_ballot_is_recorded_and_uses_ballot_total_for_percentage(self):
        response = self.client.post(
            '/api/vote',
            data=json.dumps({
                'fullName': 'Taylor Voter',
                'password': 'voter-1',
                'selections': {'chair': 'Alex'},
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(VoteSelection.objects.count(), 1)
        self.assertEqual(VoteSelection.objects.get().position, self.chair)

        second_voter = Voter.objects.create(full_name='Jordan Voter', password='voter-2')
        second_ballot = Ballot.objects.create(
            voter=second_voter,
            voter_password='voter-2',
            voter_name=second_voter.full_name,
            election_cycle=1,
        )
        VoteSelection.objects.create(ballot=second_ballot, position=self.secretary, candidate='Blair')

        results = self.client.get('/api/admin/results?fullName=admin&password=prisonbreak11').json()
        self.assertEqual(results['totalVoters'], 2)
        self.assertEqual(results['results']['chair'][0]['percentage'], 50.0)

        audit = self.client.get('/api/admin/vote-audit?fullName=admin&password=prisonbreak11').json()
        self.assertEqual(audit['totalVoters'], 2)
        self.assertEqual(audit['votes'][0]['voterName'], 'Jordan Voter')
