// Nova Stream TV entrypoint.
//
// TV apps run for hours, on cold devices, with a 5-button remote and no
// pointer. Everything we do here is shaped by that:
//
//   * No animations longer than 200ms — TV displays are larger than phones and
//     long animations feel sluggish from across a couch.
//   * Focus is THE primary interaction. Every screen has a deterministic
//     starting focus, every focusable widget knows where the arrow keys go.
//   * We avoid GestureDetector. Everything is a FocusableActionDetector hooked
//     up to our custom remote-friendly action set.
//   * Images are pre-loaded one row ahead so scrolling never blocks on the
//     network.
//   * The player is mpv via media_kit because it gives us H264/H265/AV1,
//     Dolby Vision passthrough, and HW decoding on every TV platform we care
//     about.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:media_kit/media_kit.dart';

import 'src/app/router.dart';
import 'src/app/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  MediaKit.ensureInitialized();
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  runApp(const ProviderScope(child: NovaStreamApp()));
}

class NovaStreamApp extends ConsumerWidget {
  const NovaStreamApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: 'Nova Stream',
      debugShowCheckedModeBanner: false,
      theme: NovaStreamTheme.dark(),
      darkTheme: NovaStreamTheme.dark(),
      themeMode: ThemeMode.dark,
      routerConfig: router,
    );
  }
}

final routerProvider = Provider<GoRouter>((ref) => buildRouter(ref));
