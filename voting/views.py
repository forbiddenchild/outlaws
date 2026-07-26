import json
import os
import re

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Max
from django.http import JsonResponse, FileResponse, HttpResponse, HttpResponseNotFound
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

from .models import Ballot, Contestant, ElectionSetting, Position, Voter, VoteSelection

ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'prisonbreak11')

DEFAULT_STATIC_DIR = settings.BASE_DIR / 'public'
GALLERY_DIR = settings.BASE_DIR / 'gallery'


def home(request):
    return render(request, 'index.html')


def vote(request):
    return render(request, 'vote.html')


def admin_page(request):
    return render(request, 'admin.html')


def api_positions(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    positions = list(Position.objects.order_by('order_idx', 'label').values('key', 'label'))
    return JsonResponse(positions, safe=False)


def api_voters(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    voters = list(
        Voter.objects.order_by('full_name').values('full_name', 'has_voted')
    )
    return JsonResponse(
        [
            {
                'fullName': voter['full_name'],
                'hasVoted': bool(voter['has_voted']),
            }
            for voter in voters
        ],
        safe=False,
    )


@csrf_exempt
def api_login(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    full_name = payload.get('fullName')
    password = payload.get('password')

    if not full_name or not password:
        return JsonResponse({'error': 'Both your name and unique ID are required.'}, status=400)

    try:
        voter = Voter.objects.get(full_name=full_name, password=password)
    except Voter.DoesNotExist:
        return JsonResponse({'error': 'Invalid name or unique ID. Please choose the correct name and enter the matching unique ID.'}, status=404)

    return JsonResponse({
        'message': 'Login successful.',
        'fullName': voter.full_name,
        'hasVoted': voter.has_voted,
        'role': 'voter'
    })


@csrf_exempt
def api_admin_login(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    username = payload.get('username')
    password = payload.get('password')

    if not username or not password:
        return JsonResponse({'error': 'Admin username and password are required.'}, status=400)

    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Invalid admin credentials.'}, status=401)

    return JsonResponse({
        'message': 'Admin login successful.',
        'fullName': ADMIN_USERNAME,
        'displayName': 'Admin',
        'role': 'admin',
        'password': ADMIN_PASSWORD
    })


def get_election_setting(key):
    try:
        return ElectionSetting.objects.get(key=key).value
    except ElectionSetting.DoesNotExist:
        return None


def parse_election_time(value):
    """Return a timezone-aware election timestamp, or None for invalid input."""
    from django.utils import timezone
    from django.utils.dateparse import parse_datetime

    parsed = parse_datetime(value or '')
    if not parsed:
        return None
    if timezone.is_naive(parsed):
        return timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def is_voting_window_open():
    start_time = get_election_setting('election_start_time')
    end_time = get_election_setting('election_end_time')
    if not start_time or not end_time:
        return False

    from django.utils.timezone import now

    start_dt = parse_election_time(start_time)
    end_dt = parse_election_time(end_time)
    now_dt = now()

    if not start_dt or not end_dt:
        return False

    return start_dt <= now_dt <= end_dt


def api_admin_status(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    start_time = get_election_setting('election_start_time')
    end_time = get_election_setting('election_end_time')
    if not start_time or not end_time:
        return JsonResponse({'error': 'Could not load election schedule.'}, status=500)

    return JsonResponse({
        'startTime': start_time,
        'endTime': end_time,
        'isOpen': is_voting_window_open(),
        'isClosed': not is_voting_window_open()
    })


@csrf_exempt
def api_admin_settings(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    username = payload.get('username')
    password = payload.get('password')
    start_time = payload.get('startTime')
    end_time = payload.get('endTime')

    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    start_dt = parse_election_time(start_time)
    end_dt = parse_election_time(end_time)

    if not start_dt:
        return JsonResponse({'error': 'A valid start time is required.'}, status=400)
    if not end_dt:
        return JsonResponse({'error': 'A valid end time is required.'}, status=400)

    if start_dt >= end_dt:
        return JsonResponse({'error': 'The start time must be earlier than the closing time.'}, status=400)

    start_time = start_dt.isoformat()
    end_time = end_dt.isoformat()
    ElectionSetting.objects.update_or_create(key='election_start_time', defaults={'value': start_time})
    ElectionSetting.objects.update_or_create(key='election_end_time', defaults={'value': end_time})

    return JsonResponse({'message': 'Election schedule updated.', 'startTime': start_time, 'endTime': end_time})


@csrf_exempt
def api_admin_close(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    username = payload.get('username')
    password = payload.get('password')

    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    from django.utils import timezone
    now_iso = timezone.now().isoformat()
    ElectionSetting.objects.update_or_create(key='election_end_time', defaults={'value': now_iso})

    return JsonResponse({'message': 'Voting has been ended early.', 'endTime': now_iso})


@csrf_exempt
def api_admin_contestants(request):
    if request.method == 'GET':
        username = request.GET.get('username')
        password = request.GET.get('password')
        if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
            return JsonResponse({'error': 'Admin authentication required.'}, status=401)

        contestants = Contestant.objects.select_related('position').order_by('position__order_idx', 'name')
        data = [
            {
                'id': contestant.id,
                'name': contestant.name,
                'position': contestant.position.key,
                'photoPath': contestant.photo_path,
            }
            for contestant in contestants
        ]
        return JsonResponse(data, safe=False)

    if request.method == 'POST':
        username = request.POST.get('username')
        password = request.POST.get('password')
        name = request.POST.get('name')
        position_key = request.POST.get('position')

        if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
            return JsonResponse({'error': 'Admin authentication required.'}, status=401)

        if not name or not position_key:
            return JsonResponse({'error': 'Candidate name and position are required.'}, status=400)

        try:
            position = Position.objects.get(key=position_key)
        except Position.DoesNotExist:
            return JsonResponse({'error': 'Selected position does not exist.'}, status=400)

        photo_path = ''
        photo_file = request.FILES.get('photo')
        if photo_file:
            if not os.path.exists(DEFAULT_STATIC_DIR / 'uploads'):
                os.makedirs(DEFAULT_STATIC_DIR / 'uploads', exist_ok=True)
            file_path = DEFAULT_STATIC_DIR / 'uploads' / photo_file.name
            with open(file_path, 'wb') as dest:
                for chunk in photo_file.chunks():
                    dest.write(chunk)
            photo_path = f'/uploads/{photo_file.name}'

        contestant = Contestant.objects.create(name=name.strip(), position=position, photo_path=photo_path)
        return JsonResponse({'message': 'Contestant saved successfully.', 'contestant': {'id': contestant.id, 'name': contestant.name, 'position': contestant.position.key, 'photoPath': contestant.photo_path}}, status=201)

    return JsonResponse({'error': 'Method not allowed.'}, status=405)


@csrf_exempt
def api_admin_contestant_delete(request, contestant_id):
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    username = request.GET.get('username')
    password = request.GET.get('password')
    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    try:
        contestant = Contestant.objects.get(pk=contestant_id)
    except Contestant.DoesNotExist:
        return JsonResponse({'error': 'Contestant not found.'}, status=404)

    if contestant.photo_path:
        upload_file = DEFAULT_STATIC_DIR / contestant.photo_path.lstrip('/')
        if upload_file.exists():
            upload_file.unlink()

    contestant.delete()
    return JsonResponse({'message': 'Contestant removed successfully.'})


@csrf_exempt
def api_admin_positions_create(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    username = payload.get('username')
    password = payload.get('password')
    label = payload.get('label')

    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    if not label or not label.strip():
        return JsonResponse({'error': 'A valid position label is required.'}, status=400)

    key = re.sub(r'\s+', '_', label.strip().lower())
    max_order = Position.objects.aggregate(Max('order_idx'))['order_idx__max']
    order_idx = (max_order or 0) + 1

    try:
        position = Position.objects.create(key=key, label=label.strip(), order_idx=order_idx)
    except IntegrityError:
        return JsonResponse({'error': 'A position with that key already exists.'}, status=409)

    return JsonResponse({'message': 'Position created successfully.', 'position': {'key': position.key, 'label': position.label}}, status=201)


@csrf_exempt
def api_admin_position_delete(request, position_key):
    if request.method != 'DELETE':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    username = request.GET.get('username')
    password = request.GET.get('password')
    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    try:
        position = Position.objects.get(key=position_key)
    except Position.DoesNotExist:
        return JsonResponse({'error': 'Position not found.'}, status=404)

    Contestant.objects.filter(position=position).delete()
    VoteSelection.objects.filter(position=position).delete()
    position.delete()

    return JsonResponse({'message': f'Position {position.label} deleted successfully.', 'position': {'key': position.key, 'label': position.label}})


@csrf_exempt
def api_admin_voters(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    username = payload.get('username')
    password = payload.get('password')
    full_name = payload.get('fullName')
    unique_id = payload.get('uniqueId')

    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    if not full_name or not unique_id:
        return JsonResponse({'error': 'Voter full name and unique ID are required.'}, status=400)

    try:
        voter = Voter.objects.create(full_name=full_name.strip(), password=unique_id.strip())
        return JsonResponse({'message': 'Voter registered successfully.', 'voter': {'fullName': voter.full_name, 'uniqueId': unique_id}}, status=201)
    except IntegrityError:
        return JsonResponse({'error': 'That full name is already registered. Choose a different voter.'}, status=409)


@csrf_exempt
def api_contestants(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    contestants = Contestant.objects.select_related('position').order_by('position__order_idx', 'name')
    grouped = {}
    for position in Position.objects.order_by('order_idx', 'label'):
        grouped[position.key] = []

    for contestant in contestants:
        grouped.setdefault(contestant.position.key, []).append({
            'name': contestant.name,
            'photoPath': contestant.photo_path or '/images/SaveClip.App_475291800_18038161979590096_2106789025414944852_n.webp'
        })

    return JsonResponse(grouped)


@csrf_exempt
def api_vote(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    try:
        payload = json.loads(request.body or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON payload.'}, status=400)

    full_name = payload.get('fullName')
    password = payload.get('password')
    selections = payload.get('selections')

    if not full_name or not password or not selections:
        return JsonResponse({'error': 'All required vote details are missing.'}, status=400)

    position_keys = list(Position.objects.values_list('key', flat=True))
    if not all(position_key in selections and selections[position_key] for position_key in position_keys):
        return JsonResponse({'error': 'Please select a candidate for every post.'}, status=400)

    if not is_voting_window_open():
        return JsonResponse({'error': 'Voting is not active for this window. Please wait for the scheduled start time or the election may already be closed.'}, status=403)

    try:
        voter = Voter.objects.get(full_name=full_name, password=password)
    except Voter.DoesNotExist:
        return JsonResponse({'error': 'Voter not found. Use the correct name and unique ID.'}, status=404)

    if voter.has_voted:
        return JsonResponse({'error': 'This voter has already cast a ballot.'}, status=409)

    with transaction.atomic():
        ballot = Ballot.objects.create(voter=voter, voter_password=password, voter_name=voter.full_name)
        selections_to_create = []
        for position_key in position_keys:
            try:
                position = Position.objects.get(key=position_key)
            except Position.DoesNotExist:
                raise ValueError('Invalid position configured.')
            selections_to_create.append(VoteSelection(ballot=ballot, position=position, candidate=selections[position_key]))

        VoteSelection.objects.bulk_create(selections_to_create)
        voter.has_voted = True
        voter.save(update_fields=['has_voted'])

    return JsonResponse({'message': f'Vote recorded successfully for {voter.full_name}.'}, status=201)


def api_admin_results(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    provided_username = request.GET.get('username') or request.GET.get('fullName')
    password = request.GET.get('password')
    if provided_username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return JsonResponse({'error': 'Admin authentication required.'}, status=401)

    results = {}
    positions = Position.objects.order_by('order_idx', 'label')
    for position in positions:
        rows = (
            VoteSelection.objects.filter(position=position)
            .values('candidate')
            .annotate(count=Count('candidate'))
            .order_by('-count')
        )
        results[position.key] = [
            {
                'candidate': row['candidate'],
                'count': row['count'],
                'photoPath': Contestant.objects.filter(position=position, name=row['candidate']).values_list('photo_path', flat=True).first() or '/images/SaveClip.App_475291800_18038161979590096_2106789025414944852_n.webp'
            }
            for row in rows
        ]

    is_open = is_voting_window_open()
    return JsonResponse({'isOpen': is_open, 'isClosed': not is_open, 'results': results})


def api_results(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Method not allowed.'}, status=405)

    is_open = is_voting_window_open()
    return JsonResponse({'isOpen': is_open, 'isClosed': not is_open, 'results': {}})


def public_asset(request, path):
    if path.startswith('gallery/'):
        file_path = GALLERY_DIR / path.removeprefix('gallery/')
    else:
        file_path = DEFAULT_STATIC_DIR / path
    if file_path.exists() and file_path.is_file():
        return FileResponse(open(file_path, 'rb'))
    return HttpResponseNotFound('File not found.')
