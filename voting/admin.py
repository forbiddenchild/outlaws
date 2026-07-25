from django.contrib import admin

from .models import Ballot, Contestant, ElectionSetting, Position, Voter, VoteSelection


@admin.register(Position)
class PositionAdmin(admin.ModelAdmin):
    list_display = ('label', 'key', 'order_idx')
    ordering = ('order_idx', 'label')
    search_fields = ('label', 'key')


@admin.register(Contestant)
class ContestantAdmin(admin.ModelAdmin):
    list_display = ('name', 'position', 'photo_path')
    list_filter = ('position',)
    search_fields = ('name',)


@admin.register(Voter)
class VoterAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'has_voted')
    search_fields = ('full_name',)
    list_filter = ('has_voted',)


@admin.register(Ballot)
class BallotAdmin(admin.ModelAdmin):
    list_display = ('voter_name', 'voter', 'created_at')
    search_fields = ('voter_name',)


@admin.register(VoteSelection)
class VoteSelectionAdmin(admin.ModelAdmin):
    list_display = ('ballot', 'position', 'candidate')
    list_filter = ('position',)
    search_fields = ('candidate',)


@admin.register(ElectionSetting)
class ElectionSettingAdmin(admin.ModelAdmin):
    list_display = ('key', 'value')
    search_fields = ('key',)
