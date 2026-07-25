from django.db import models


class Position(models.Model):
    key = models.CharField(max_length=255, unique=True)
    label = models.CharField(max_length=255)
    order_idx = models.IntegerField(default=0)

    class Meta:
        ordering = ['order_idx', 'label']

    def __str__(self):
        return self.label


class Contestant(models.Model):
    name = models.CharField(max_length=255)
    position = models.ForeignKey(Position, on_delete=models.CASCADE, related_name='contestants')
    photo_path = models.CharField(max_length=1024, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('name', 'position')
        ordering = ['position__order_idx', 'name']

    def __str__(self):
        return f'{self.name} ({self.position.label})'


class Voter(models.Model):
    full_name = models.CharField(max_length=255, unique=True)
    password = models.CharField(max_length=255)
    has_voted = models.BooleanField(default=False)

    def __str__(self):
        return self.full_name


class Ballot(models.Model):
    voter = models.ForeignKey(Voter, null=True, on_delete=models.SET_NULL)
    voter_password = models.CharField(max_length=255)
    voter_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Ballot ({self.voter_name})'


class VoteSelection(models.Model):
    ballot = models.ForeignKey(Ballot, on_delete=models.CASCADE, related_name='selections')
    position = models.ForeignKey(Position, on_delete=models.CASCADE)
    candidate = models.CharField(max_length=255)

    def __str__(self):
        return f'{self.position.label}: {self.candidate}'


class ElectionSetting(models.Model):
    key = models.CharField(max_length=255, unique=True)
    value = models.TextField()

    def __str__(self):
        return f'{self.key} = {self.value}'
