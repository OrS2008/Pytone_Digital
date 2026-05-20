# libs/streaming-core

Shared streaming utilities used by the playback proxy, the recording worker,
the DVR manifest builder, and the client playback chooser.

Contents:

* **HLS manifest types and helpers.** Lightweight parsers and writers used in
  several services (proxy rewriting, DVR manifest building). Co-located here
  to keep them on the same version.
* **DASH MPD helpers.** Same idea for DASH.
* **Codec inference.** Decode `avc1.*`, `hev1.*`, `av01.*`, `ec-3` strings
  into normalised codec / profile / level descriptors used by the catalogue.
* **CMAF segment math.** Convert between media-time, wall-clock time, and
  segment numbers for catch-up playback.

Why it lives here rather than inside each service:

* Bugs in CMAF math are extremely hard to find and we don't want each service
  to ship its own copy.
* The Go playback proxy and the Dart client both need this; we publish a
  Go module + a Dart package side-by-side.
