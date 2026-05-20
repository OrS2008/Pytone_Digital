import 'package:flutter/material.dart';

import '../../widgets/nav_bar.dart';

class SportsScreen extends StatelessWidget {
  const SportsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        const PytoneNavBar(),
        Expanded(
          child: Center(
            child: Text(
                'Live · Upcoming · Replay · Multi-view · Favourite teams · Highlights',
                style: Theme.of(context).textTheme.bodyMedium),
          ),
        ),
      ]),
    );
  }
}
