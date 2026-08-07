package app.pisga.mobile;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Android 15+ (targetSdk 36) enforces edge-to-edge regardless of what
        // we do here, but older OS versions on the same targetSdk don't turn
        // it on by default — this makes it explicit on every version so the
        // WebView always receives real WindowInsets for the SafeArea plugin
        // to read, instead of only working by OS-version accident.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        super.onCreate(savedInstanceState);
    }
}
