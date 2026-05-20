import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../focus/focus_engine.dart';
import '../../widgets/hero_banner.dart';
import '../../widgets/nav_bar.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rows = const [
      _HomeRowSpec(zone: ZoneId('home-continue'), title: 'Continue Watching'),
      _HomeRowSpec(zone: ZoneId('home-live'), title: 'Live Now'),
      _HomeRowSpec(zone: ZoneId('home-sports'), title: 'Sports'),
      _HomeRowSpec(zone: ZoneId('home-trending'), title: 'Trending'),
      _HomeRowSpec(zone: ZoneId('home-recommended'), title: 'Recommended for You'),
      _HomeRowSpec(zone: ZoneId('home-recent'), title: 'Recently Added'),
      _HomeRowSpec(zone: ZoneId('home-replay'), title: 'Replay Highlights'),
    ];

    return FocusMemory(
      child: Scaffold(
        body: CustomScrollView(
          slivers: [
            const SliverToBoxAdapter(child: PytoneNavBar()),
            const SliverToBoxAdapter(child: HeroBanner()),
            const SliverToBoxAdapter(child: SizedBox(height: 24)),
            for (final r in rows)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 28),
                  child: _HomeRow(spec: r),
                ),
              ),
            const SliverToBoxAdapter(child: SizedBox(height: 96)),
          ],
        ),
      ),
    );
  }
}

class _HomeRowSpec {
  const _HomeRowSpec({required this.zone, required this.title});
  final ZoneId zone;
  final String title;
}

class _HomeRow extends StatelessWidget {
  const _HomeRow({required this.spec});
  final _HomeRowSpec spec;

  @override
  Widget build(BuildContext context) {
    // Real implementation fetches via the gateway with Riverpod; we render
    // the layout so the design system reads correctly.
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(48, 0, 0, 12),
          child: Text(spec.title,
              style: Theme.of(context).textTheme.headlineSmall),
        ),
        FocusZone(
          id: spec.zone,
          itemCount: 12,
          itemExtent: 320,
          builder: (ctx, i, selected) => _Tile(
            title: '${spec.title} #${i + 1}',
            selected: selected,
          ),
        ),
      ],
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.title, required this.selected});
  final String title;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 140),
      width: 320,
      height: 180,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: const Color(0xFF11141B),
        border: Border.all(
          color: selected
              ? Theme.of(context).colorScheme.primary
              : Colors.transparent,
          width: 3,
        ),
        boxShadow: selected
            ? [
                BoxShadow(
                  color: Theme.of(context).colorScheme.primary.withOpacity(0.45),
                  blurRadius: 32,
                  spreadRadius: 0.5,
                ),
              ]
            : null,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(13),
        child: Stack(
          fit: StackFit.expand,
          children: [
            CachedNetworkImage(
              imageUrl: 'https://picsum.photos/seed/$title/640/360',
              fit: BoxFit.cover,
              fadeInDuration: const Duration(milliseconds: 120),
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.topCenter,
                  colors: [Colors.black87, Colors.transparent],
                  stops: [0.0, 0.55],
                ),
              ),
            ),
            Align(
              alignment: Alignment.bottomLeft,
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Text(title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w600,
                    )),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
