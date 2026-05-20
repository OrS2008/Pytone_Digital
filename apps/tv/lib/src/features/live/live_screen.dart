import 'package:flutter/material.dart';

import '../../widgets/nav_bar.dart';

// LiveScreen — the EPG-as-app: vertical channel list on the left, horizontal
// programme timeline on the right, "now" line anchored to a vertical accent
// stroke. Pressing CENTER on a now-playing cell starts playback. Pressing
// CENTER on a future cell schedules a recording. Pressing CENTER on a past
// cell within catch-up window starts catch-up playback.
class LiveScreen extends StatelessWidget {
  const LiveScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Column(children: [PytoneNavBar(), Expanded(child: _EpgGrid())],
      ),
    );
  }
}

class _EpgGrid extends StatelessWidget {
  const _EpgGrid();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text('EPG grid renders here.\n'
          'Channels left, timeline right, now-line anchored at 320px.',
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium),
    );
  }
}
