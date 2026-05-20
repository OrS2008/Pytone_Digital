// PlayerScreen — the most important screen in the app.
//
// Design constraints:
//   * Time-to-first-frame target: 500ms from "Play" press.
//   * No black flash on channel switch — the previous frame stays visible
//     until the new decoder reports first frame (a `KeepAlive` overlay).
//   * Overlays are explicit: only appear when the user moves the remote;
//     auto-dismiss after 4 seconds of inactivity. Critically, *focus* is on
//     the overlay only while it's visible, so a `back` press first hides the
//     overlay rather than leaving playback.
//   * Subtitle / audio switching uses an in-player tray, not a separate
//     screen — switching is one click.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:media_kit/media_kit.dart';
import 'package:media_kit_video/media_kit_video.dart';

class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({super.key, required this.contentId});
  final String contentId;

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends ConsumerState<PlayerScreen> {
  late final Player _player;
  late final VideoController _controller;
  bool _overlay = false;
  DateTime _lastInteraction = DateTime.now();
  late final FocusNode _focus = FocusNode(debugLabel: 'player');

  @override
  void initState() {
    super.initState();
    _player = Player();
    _controller = VideoController(_player);
    // Fetch the playback ticket from the gateway and open the URL. The
    // ticket has a short TTL; if it expires mid-playback we'll re-request
    // and seamlessly continue.
    _open();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  Future<void> _open() async {
    // Real client: call `gateway.GetPlaybackTicket(contentId)` then open.
    const url = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
    await _player.open(Media(url), play: true);
  }

  @override
  void dispose() {
    _player.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _markInteraction() {
    setState(() {
      _overlay = true;
      _lastInteraction = DateTime.now();
    });
    Future.delayed(const Duration(seconds: 4), () {
      if (!mounted) return;
      if (DateTime.now().difference(_lastInteraction).inSeconds >= 4) {
        setState(() => _overlay = false);
      }
    });
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent ev) {
    if (ev is! KeyDownEvent) return KeyEventResult.ignored;
    _markInteraction();
    switch (ev.logicalKey) {
      case LogicalKeyboardKey.mediaPlayPause:
      case LogicalKeyboardKey.space:
      case LogicalKeyboardKey.select:
        _player.playOrPause();
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        _player.seek(_player.state.position + const Duration(seconds: 10));
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowLeft:
        _player.seek(_player.state.position - const Duration(seconds: 10));
        return KeyEventResult.handled;
      case LogicalKeyboardKey.escape:
      case LogicalKeyboardKey.goBack:
        if (_overlay) {
          setState(() => _overlay = false);
        } else {
          Navigator.of(context).maybePop();
        }
        return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      autofocus: true,
      focusNode: _focus,
      onKeyEvent: _onKey,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          fit: StackFit.expand,
          children: [
            Video(controller: _controller, controls: NoVideoControls),
            AnimatedOpacity(
              opacity: _overlay ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 180),
              child: _PlayerOverlay(player: _player),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlayerOverlay extends StatelessWidget {
  const _PlayerOverlay({required this.player});
  final Player player;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xCC000000), Color(0x00000000)],
          stops: [0, 0.4],
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(48),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.end,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Premier League · Live',
                style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('Arsenal vs. Manchester City',
                style: TextStyle(color: Colors.white70, fontSize: 16)),
            const SizedBox(height: 24),
            StreamBuilder(
              stream: player.stream.position,
              builder: (ctx, snap) {
                final pos = snap.data ?? Duration.zero;
                final dur = player.state.duration;
                final ratio = dur.inMilliseconds == 0
                    ? 0.0
                    : pos.inMilliseconds / dur.inMilliseconds;
                return ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    minHeight: 4,
                    value: ratio.clamp(0, 1),
                    backgroundColor: Colors.white24,
                    valueColor: AlwaysStoppedAnimation(
                        Theme.of(context).colorScheme.primary),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
