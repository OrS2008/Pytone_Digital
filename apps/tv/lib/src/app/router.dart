import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/home/home_screen.dart';
import '../features/live/live_screen.dart';
import '../features/vod/vod_screen.dart';
import '../features/dvr/dvr_screen.dart';
import '../features/sports/sports_screen.dart';
import '../features/search/search_screen.dart';
import '../features/player/player_screen.dart';

GoRouter buildRouter(Ref ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
      GoRoute(path: '/live', builder: (_, __) => const LiveScreen()),
      GoRoute(path: '/vod', builder: (_, __) => const VodScreen()),
      GoRoute(path: '/dvr', builder: (_, __) => const DvrScreen()),
      GoRoute(path: '/sports', builder: (_, __) => const SportsScreen()),
      GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
      GoRoute(
        path: '/play/:contentId',
        builder: (ctx, state) => PlayerScreen(contentId: state.pathParameters['contentId']!),
      ),
    ],
  );
}
