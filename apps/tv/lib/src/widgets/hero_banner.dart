import 'package:flutter/material.dart';

class HeroBanner extends StatelessWidget {
  const HeroBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 520,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Backdrop. In production this is the currently selected
          // recommendation's backdrop; auto-plays a 30s trailer after 5s of
          // focus on the same item.
          Image.network(
            'https://picsum.photos/seed/pytone-hero/1920/1080',
            fit: BoxFit.cover,
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: [Color(0xCC000000), Color(0x00000000)],
                stops: [0.0, 0.7],
              ),
            ),
          ),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [Color(0xFF06070A), Color(0x00000000)],
                stops: [0.0, 0.45],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(64, 80, 64, 64),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Text('Live now',
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.primary,
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 2,
                    )),
                const SizedBox(height: 8),
                Text(
                  'Premier League · Sunday Big Match',
                  style: Theme.of(context).textTheme.displayLarge,
                ),
                const SizedBox(height: 12),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 720),
                  child: Text(
                    'Arsenal vs. Manchester City — full match, multi-angle, '
                    'instant replays, AI-generated highlight reel from kick-off.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                const SizedBox(height: 20),
                Row(
                  children: const [
                    _Cta(label: 'Play', primary: true),
                    SizedBox(width: 12),
                    _Cta(label: 'More info'),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Cta extends StatelessWidget {
  const _Cta({required this.label, this.primary = false});
  final String label;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return FocusableActionDetector(
      mouseCursor: SystemMouseCursors.click,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 14),
        decoration: BoxDecoration(
          color: primary ? c.primary : Colors.white.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(label,
            style: TextStyle(
              color: primary ? Colors.white : c.onSurface,
              fontWeight: FontWeight.w700,
              fontSize: 16,
            )),
      ),
    );
  }
}
