# libs/player-core

Shared player abstraction used by both the TV and mobile Flutter apps.

We don't ship a Dart wrapper around a particular native player. We define an
abstract `PlayerCore` interface and implement it three different ways:

| Implementation | Used on | Backed by |
| --- | --- | --- |
| `MediaKitPlayer` | Android, Android TV, Fire TV, Linux, Windows, macOS | libmpv via `media_kit` |
| `AvFoundationPlayer` | iOS, iPadOS, tvOS | AVPlayer (via platform channel) |
| `ExoPlayerSurface` | Special-cased for high-DRM Android paths | ExoPlayer (via platform channel) |

The interface is the union of what mpv, AVPlayer and ExoPlayer all support
natively — no compatibility shims, no synthetic state machines. Anything
mpv-specific (e.g. lavfi filters) lives in the MediaKitPlayer impl and is
not part of the shared surface.

## What's in the interface

```dart
abstract class PlayerCore {
  Stream<PlayerState> get state;
  Stream<Duration>    get position;
  Stream<Duration>    get duration;

  Future<void> open(PlaybackTicket ticket);
  Future<void> play();
  Future<void> pause();
  Future<void> seek(Duration to);
  Future<void> setAudioTrack(String trackId);
  Future<void> setSubtitleTrack(String? trackId);
  Future<void> setMaxBitrate(int kbps);
  Future<void> dispose();
}
```

## Why this matters

The TV remote logic and the mobile gesture logic both reach into the same
abstraction. Bugs in playback control flow get fixed once. The QoE sampler
(which feeds the AI supervisor) is implemented once, against the abstract
state stream.
