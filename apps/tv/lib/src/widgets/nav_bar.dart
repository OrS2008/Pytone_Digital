import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class NovaStreamNavBar extends StatelessWidget {
  const NovaStreamNavBar({super.key});

  static const _items = [
    _NavItem('Home', '/'),
    _NavItem('Live', '/live'),
    _NavItem('Sports', '/sports'),
    _NavItem('Movies', '/vod'),
    _NavItem('DVR', '/dvr'),
    _NavItem('Search', '/search'),
  ];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(64, 40, 64, 24),
      child: Row(
        children: [
          Text('NOVA STREAM',
              style: TextStyle(
                color: Theme.of(context).colorScheme.primary,
                fontSize: 22,
                fontWeight: FontWeight.w800,
                letterSpacing: 6,
              )),
          const SizedBox(width: 56),
          for (final item in _items)
            _NavBarLink(item: item),
        ],
      ),
    );
  }
}

class _NavItem {
  const _NavItem(this.label, this.path);
  final String label;
  final String path;
}

class _NavBarLink extends StatefulWidget {
  const _NavBarLink({required this.item});
  final _NavItem item;
  @override
  State<_NavBarLink> createState() => _NavBarLinkState();
}

class _NavBarLinkState extends State<_NavBarLink> {
  bool _hover = false;
  @override
  Widget build(BuildContext context) {
    return Focus(
      onFocusChange: (v) => setState(() => _hover = v),
      child: GestureDetector(
        onTap: () => context.go(widget.item.path),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18),
          child: Text(widget.item.label,
              style: TextStyle(
                color: _hover ? Colors.white : Colors.white70,
                fontSize: 18,
                fontWeight: _hover ? FontWeight.w700 : FontWeight.w500,
              )),
        ),
      ),
    );
  }
}
