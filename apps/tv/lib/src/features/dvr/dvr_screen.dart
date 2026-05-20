import 'package:flutter/material.dart';

import '../../widgets/nav_bar.dart';

class DvrScreen extends StatelessWidget {
  const DvrScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        const PytoneNavBar(),
        Expanded(
          child: Center(
            child: Text(
                'Recordings (completed) · Upcoming · Series rules · Catch-up',
                style: Theme.of(context).textTheme.bodyMedium),
          ),
        ),
      ]),
    );
  }
}
