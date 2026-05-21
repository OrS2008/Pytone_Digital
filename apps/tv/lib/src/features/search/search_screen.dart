import 'package:flutter/material.dart';

import '../../widgets/nav_bar.dart';

class SearchScreen extends StatelessWidget {
  const SearchScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        const NovaStreamNavBar(),
        Expanded(
          child: Center(
            child: Text(
                'On-screen keyboard + voice search.\n'
                'Results blend Channels · Movies · Series · Sports · DVR · Replay.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium),
          ),
        ),
      ]),
    );
  }
}
