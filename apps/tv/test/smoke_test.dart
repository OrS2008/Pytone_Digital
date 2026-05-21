// Smoke test — instantiates the NovaStreamTheme to ensure theme tokens are
// internally consistent. We deliberately don't mount the full app: that
// would require `media_kit` native bindings which Flutter Test can't load.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:nova_stream_tv/src/app/theme.dart';

void main() {
  test('NovaStreamTheme.dark() builds without error', () {
    final theme = NovaStreamTheme.dark();
    expect(theme, isA<ThemeData>());
    expect(theme.brightness, Brightness.dark);
    expect(theme.colorScheme.primary, isNot(equals(Colors.transparent)));
  });

  test('NovaStreamTheme exposes a TextTheme with display style', () {
    final theme = NovaStreamTheme.dark();
    expect(theme.textTheme.displayLarge, isNotNull);
    expect(theme.textTheme.displayLarge!.fontSize, greaterThan(40));
  });
}
