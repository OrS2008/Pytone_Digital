import 'package:flutter/material.dart';

class PytoneTheme {
  static ThemeData dark() {
    const accent = Color(0xFFFF3B6E); // signature Pytone pink
    const surface = Color(0xFF06070A);
    const surfaceContainer = Color(0xFF0E1015);
    const onSurface = Color(0xFFE9EBF1);

    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: surface,
      colorScheme: const ColorScheme.dark(
        primary: accent,
        secondary: Color(0xFF8B5CF6),
        surface: surface,
        onSurface: onSurface,
      ),
      fontFamily: 'PytoneDisplay',
      textTheme: const TextTheme(
        displayLarge: TextStyle(
          fontSize: 56,
          fontWeight: FontWeight.w700,
          color: onSurface,
          height: 1.05,
          letterSpacing: -1.5,
        ),
        headlineSmall: TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w700,
          color: onSurface,
          letterSpacing: -0.4,
        ),
        titleMedium: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: onSurface,
        ),
        bodyMedium: TextStyle(
          fontSize: 15,
          color: Color(0xFFB7BEC9),
        ),
      ),
      cardTheme: CardThemeData(
        color: surfaceContainer,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: _FadePageTransitionsBuilder(),
          TargetPlatform.iOS: _FadePageTransitionsBuilder(),
          TargetPlatform.macOS: _FadePageTransitionsBuilder(),
        },
      ),
    );
  }
}

class _FadePageTransitionsBuilder extends PageTransitionsBuilder {
  const _FadePageTransitionsBuilder();
  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    // TV transitions: fast cross-fade, no slide. Slides feel slow on big
    // panels; a 180ms fade reads as instant.
    return FadeTransition(
      opacity: CurvedAnimation(parent: animation, curve: Curves.easeOut),
      child: child,
    );
  }
}
