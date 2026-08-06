from django.urls import path, re_path

from . import views

urlpatterns = [
    path('', views.home, name='home'),
    path('vote.html', views.vote, name='vote'),
    path('admin.html', views.admin_page, name='admin_page'),
    path('api/positions', views.api_positions),
    path('api/voters', views.api_voters),
    path('api/login', views.api_login),
    path('api/admin/login', views.api_admin_login),
    path('api/admin/status', views.api_admin_status),
    path('api/admin/settings', views.api_admin_settings),
    path('api/admin/close', views.api_admin_close),
    path('api/admin/contestants', views.api_admin_contestants),
    path('api/admin/contestants/<int:contestant_id>', views.api_admin_contestant_delete),
    path('api/admin/positions', views.api_admin_positions_create),
    path('api/admin/positions/<str:position_key>', views.api_admin_position_delete),
    path('api/admin/voters', views.api_admin_voters),
    path('api/contestants', views.api_contestants),
    path('api/vote', views.api_vote),
    path('api/admin/results', views.api_admin_results),
    path('api/admin/vote-audit', views.api_admin_vote_audit),
    path('api/results', views.api_results),
    re_path(r'^(?P<path>.*)$', views.public_asset),
]
