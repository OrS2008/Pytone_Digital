// Nova Stream Mobile entrypoint.
//
// Shares all data layer and design tokens with the TV app via libs/player-core
// and libs/ui-kit. The mobile app is *not* a port of the TV app: layouts are
// reflowed for portrait, search uses the OS keyboard rather than the
// on-screen TV keyboard, and gestures replace the focus engine.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:media_kit/media_kit.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  runApp(const ProviderScope(child: MobileApp()));
}

class MobileApp extends StatelessWidget {
  const MobileApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Nova Stream',
      theme: ThemeData.dark(useMaterial3: true),
      home: const _HomeShell(),
    );
  }
}

class _HomeShell extends StatefulWidget {
  const _HomeShell();
  @override
  State<_HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<_HomeShell> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: const Center(child: Text('Nova Stream Mobile')),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.live_tv_outlined), label: 'Live'),
          NavigationDestination(icon: Icon(Icons.sports_soccer_outlined), label: 'Sports'),
          NavigationDestination(icon: Icon(Icons.movie_outlined), label: 'Movies'),
          NavigationDestination(icon: Icon(Icons.search), label: 'Search'),
        ],
      ),
    );
  }
}
