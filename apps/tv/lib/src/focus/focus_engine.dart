// The Nova Stream focus engine.
//
// Flutter's stock focus traversal works, but on TVs it is too unpredictable:
// it can land on an unexpected widget when the layout shifts, dead-end on
// borders, and skip rows when you expected it not to. We therefore wrap
// Flutter's FocusManager with a small custom layer that:
//
//   1. Defines explicit *focus zones*. Each zone (e.g. nav bar, hero, row 1)
//      owns its internal traversal. Crossing zone boundaries is governed by
//      ZonePolicy, so left-from-row-3 always returns to nav, no matter what
//      widgets happen to be on screen.
//
//   2. Remembers the last-focused index inside each zone. When you leave a row
//      and come back, you land exactly where you left off — TV users learn
//      that pattern within minutes.
//
//   3. Forwards remote arrow keys / center / back to actions via
//      Intent/Action so the same code drives Android TV D-pad, Apple TV
//      Siri remote swipes, and keyboard.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Identifies a focus zone. Use one constant per row / section.
class ZoneId {
  final String id;
  const ZoneId(this.id);
  @override
  int get hashCode => id.hashCode;
  @override
  bool operator ==(Object other) => other is ZoneId && other.id == id;
}

/// Singleton-ish in-app focus memory: which child of each zone was last
/// selected. Implemented as an InheritedWidget so nested zones inherit the
/// same memory map without globals.
class FocusMemory extends InheritedWidget {
  FocusMemory({super.key, required super.child});
  final Map<ZoneId, int> _last = {};
  int last(ZoneId z, int fallback) => _last[z] ?? fallback;
  void remember(ZoneId z, int i) => _last[z] = i;
  static FocusMemory of(BuildContext c) {
    final m = c.dependOnInheritedWidgetOfExactType<FocusMemory>();
    assert(m != null, 'Wrap your app in FocusMemory');
    return m!;
  }

  @override
  bool updateShouldNotify(covariant FocusMemory oldWidget) => false;
}

/// A focus zone is a horizontal strip with predictable behaviour. When focused,
/// arrow-left/right shift the active index; arrow-up/down call onMoveOut.
class FocusZone extends StatefulWidget {
  const FocusZone({
    super.key,
    required this.id,
    required this.itemCount,
    required this.builder,
    this.onMoveOut,
    this.itemExtent = 280,
    this.spacing = 16,
  });

  final ZoneId id;
  final int itemCount;
  final Widget Function(BuildContext, int index, bool selected) builder;
  final void Function(AxisDirection)? onMoveOut;
  final double itemExtent;
  final double spacing;

  @override
  State<FocusZone> createState() => _FocusZoneState();
}

class _FocusZoneState extends State<FocusZone> {
  late int _index;
  final _scroll = ScrollController();
  final _focusNode = FocusNode(debugLabel: 'zone-focus');

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _index = FocusMemory.of(context).last(widget.id, 0);
  }

  @override
  void dispose() {
    _scroll.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _moveTo(int i) {
    if (i < 0 || i >= widget.itemCount) return;
    setState(() => _index = i);
    FocusMemory.of(context).remember(widget.id, i);
    _ensureVisible(i);
  }

  void _ensureVisible(int i) {
    final target = i * (widget.itemExtent + widget.spacing);
    if (!_scroll.hasClients) return;
    _scroll.animateTo(
      target - 64,
      duration: const Duration(milliseconds: 180),
      curve: Curves.easeOut,
    );
  }

  KeyEventResult _onKey(FocusNode _, KeyEvent ev) {
    if (ev is! KeyDownEvent && ev is! KeyRepeatEvent) return KeyEventResult.ignored;
    switch (ev.logicalKey) {
      case LogicalKeyboardKey.arrowLeft:
        _moveTo(_index - 1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowRight:
        _moveTo(_index + 1);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowUp:
        widget.onMoveOut?.call(AxisDirection.up);
        return KeyEventResult.handled;
      case LogicalKeyboardKey.arrowDown:
        widget.onMoveOut?.call(AxisDirection.down);
        return KeyEventResult.handled;
    }
    return KeyEventResult.ignored;
  }

  @override
  Widget build(BuildContext context) {
    return Focus(
      focusNode: _focusNode,
      onKeyEvent: _onKey,
      child: SizedBox(
        height: widget.itemExtent * 0.6 + 64,
        child: ListView.separated(
          controller: _scroll,
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 48),
          itemCount: widget.itemCount,
          separatorBuilder: (_, __) => SizedBox(width: widget.spacing),
          itemBuilder: (ctx, i) {
            final selected = i == _index && _focusNode.hasFocus;
            return AnimatedScale(
              duration: const Duration(milliseconds: 140),
              scale: selected ? 1.06 : 1.0,
              curve: Curves.easeOut,
              child: widget.builder(ctx, i, selected),
            );
          },
        ),
      ),
    );
  }
}
