import 'package:flutter/material.dart';

import '../../widgets/nav_bar.dart';

class VodScreen extends StatelessWidget {
  const VodScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        const PytoneNavBar(),
        Expanded(
          child: Center(
            child: Text('Movies + Series. Hero + rows like Home.',
                style: Theme.of(context).textTheme.bodyMedium),
          ),
        ),
      ]),
    );
  }
}
