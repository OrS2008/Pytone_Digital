package tv.novastream.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Nova Stream — main activity.
 *
 * <p>Customisations on top of Capacitor's default BridgeActivity:
 * <ul>
 *   <li>Edge-to-edge window: content draws behind the system bars so
 *       the WebView gets the full screen real-estate, matching what
 *       polished EU streaming apps (M6+, Molotov, Pluto) do.</li>
 *   <li>Dark status / nav bars with our brand background colour, so
 *       the seam between the app chrome and the WebView disappears.</li>
 *   <li>Keep the screen on while the activity is in foreground — the
 *       WebView player would otherwise let the screen dim/lock during
 *       playback. The web side toggles this with the Wake Lock API
 *       when actually playing, but holding it at activity-level is a
 *       reliable fallback.</li>
 *   <li>WebView tuned for media: hardware accel + DOM storage + mixed
 *       content blocked (we already serve every upstream URL through
 *       /api/stream so the WebView never needs http://).</li>
 * </ul>
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Edge-to-edge BEFORE super so the content view is created
        // with the right window flags.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Match the brand background so the system bars blend with the
        // app even before the WebView paints. Opus IPTV deep-navy palette.
        window.setStatusBarColor(0xFF08090F);
        window.setNavigationBarColor(0xFF0B0C12);

        // Light icons on dark bars.
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (insets != null) {
            insets.setAppearanceLightStatusBars(false);
            insets.setAppearanceLightNavigationBars(false);
        }

        // Player tuning on the WebView Capacitor created for us.
        if (this.bridge != null && this.bridge.getWebView() != null) {
            WebSettings s = this.bridge.getWebView().getSettings();
            s.setMediaPlaybackRequiresUserGesture(false);  // autoplay HLS once user has navigated
            s.setDomStorageEnabled(true);
            s.setDatabaseEnabled(true);
            s.setLoadWithOverviewMode(true);
            s.setUseWideViewPort(true);
            // Pinch handling. We keep setSupportZoom=true so modern
            // WebView still honours user-scalable from the viewport
            // meta (lets the user zoom non-player areas), but we
            // explicitly DISABLE setBuiltInZoomControls. The legacy
            // built-in zoom mechanism intercepts pinch gestures BEFORE
            // touchmove fires in JS, which would steal our custom
            // pinch-to-fullscreen handler on the video. With it off,
            // the JS handler runs first, calls preventDefault, and
            // only un-handled pinches fall through to native zoom.
            s.setSupportZoom(true);
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                s.setSafeBrowsingEnabled(true);
            }
            // Block the long-press text-selection menu — feels native,
            // matches the M6+/Molotov experience.
            this.bridge.getWebView().setLongClickable(false);
            this.bridge.getWebView().setHapticFeedbackEnabled(false);
            // Transparent so the brand background shows through during
            // the WebView's first paint.
            this.bridge.getWebView().setBackgroundColor(0xFF0B0C12);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveSticky();
        }
    }

    /**
     * Hide nav-bar + status-bar but allow the user to swipe them back in
     * temporarily. This is the modern "immersive sticky" mode — feels
     * native during fullscreen video, and keeps the home indicator
     * available with a swipe up.
     */
    private void applyImmersiveSticky() {
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat insets =
            WindowCompat.getInsetsController(getWindow(), decor);
        if (insets != null) {
            insets.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            // Note: we DON'T hide the bars at startup — the home/auth
            // pages keep them visible. The web side toggles fullscreen
            // mode through the Capacitor StatusBar plugin when video
            // playback actually starts.
        }
    }
}
