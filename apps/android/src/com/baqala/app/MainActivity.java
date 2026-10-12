package com.baqala.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * BAQALA pour Android : affiche le serveur du magasin (réseau local ou Tailscale) dans une WebView.
 * - Premier lancement / serveur injoignable : écran de connexion (assets/connect.html).
 * - window.BaqalaApp (serveur configuré uniquement) : impression Android, enregistrement des exports, changement de serveur.
 */
public class MainActivity extends Activity {

    private static final String SETUP_URL = "file:///android_asset/connect.html";
    private static final String PREFS = "baqala";

    private WebView web;
    private SharedPreferences prefs;
    /** URL de la page affichée, pour n'ouvrir les ponts qu'aux pages de confiance. */
    private volatile String currentUrl = "";
    private long lastBack;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " BaqalaAndroid/1.0");

        web.addJavascriptInterface(new SetupBridge(), "BaqalaSetup");
        web.addJavascriptInterface(new AppBridge(), "BaqalaApp");
        web.setWebViewClient(new Client());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            openServer();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    // ---------- Configuration ----------

    private JSONObject config() {
        try {
            return new JSONObject(prefs.getString("config", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private String serverOrigin() {
        String url = config().optString("serverUrl", "");
        if (url.isEmpty()) return null;
        Uri u = Uri.parse(url);
        if (u.getScheme() == null || u.getHost() == null) return null;
        return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    private static String originOf(String url) {
        Uri u = Uri.parse(url);
        if (u.getScheme() == null || u.getHost() == null) return "";
        return u.getScheme() + "://" + u.getHost() + (u.getPort() > 0 ? ":" + u.getPort() : "");
    }

    private void openServer() {
        String origin = serverOrigin();
        if (origin == null) showSetup(null);
        else web.loadUrl(config().optString("serverUrl"));
    }

    private void showSetup(String reason) {
        web.loadUrl(reason == null ? SETUP_URL : SETUP_URL + "?reason=" + reason);
    }

    private boolean onSetupPage() {
        return currentUrl.startsWith("file:///android_asset/");
    }

    private boolean onServerPage() {
        String origin = serverOrigin();
        return origin != null && originOf(currentUrl).equals(origin);
    }

    // ---------- Navigation ----------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            if (url.startsWith("file:///android_asset/")) return false;
            String origin = serverOrigin();
            if (origin != null && originOf(url).equals(origin)) return false;
            // Lien extérieur : navigateur du téléphone
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            currentUrl = url;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            // Serveur injoignable (Wi-Fi coupé, PC éteint, Tailscale déconnecté) : écran de connexion qui réessaie
            if (request.isForMainFrame() && !request.getUrl().toString().startsWith("file:")) {
                showSetup("offline");
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack() && !onSetupPage()) {
            web.goBack();
            return;
        }
        long now = System.currentTimeMillis();
        if (now - lastBack < 2000) {
            super.onBackPressed();
        } else {
            lastBack = now;
            Toast.makeText(this, R.string.press_back_again, Toast.LENGTH_SHORT).show();
        }
    }

    // ---------- Pont de l'écran de connexion ----------

    private class SetupBridge {
        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String getConfig() {
            return onSetupPage() ? config().toString() : "{}";
        }

        /** Test de l'adresse côté Android (évite les restrictions réseau d'une page locale). */
        @JavascriptInterface
        public String checkServer(String url) {
            if (!onSetupPage()) return "unreachable";
            java.net.HttpURLConnection c = null;
            try {
                c = (java.net.HttpURLConnection) new java.net.URL(url + "/api/health").openConnection();
                c.setConnectTimeout(6000);
                c.setReadTimeout(6000);
                java.io.InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream();
                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                byte[] b = new byte[4096];
                int n;
                while (in != null && (n = in.read(b)) > 0 && buf.size() < 65536) buf.write(b, 0, n);
                JSONObject j = new JSONObject(buf.toString("UTF-8"));
                return "baqala".equals(j.optString("app")) ? "ok" : "notBaqala";
            } catch (org.json.JSONException e) {
                return "notBaqala";
            } catch (Exception e) {
                return "unreachable";
            } finally {
                if (c != null) c.disconnect();
            }
        }

        @JavascriptInterface
        public void connect(String json) {
            if (!onSetupPage()) return;
            try {
                JSONObject next = new JSONObject(json);
                prefs.edit().putString("config", next.toString()).apply();
            } catch (Exception e) {
                return;
            }
            runOnUiThread(new Runnable() {
                public void run() {
                    web.clearHistory();
                    openServer();
                }
            });
        }
    }

    // ---------- Pont de l'application (serveur configuré uniquement) ----------

    private class AppBridge {
        @JavascriptInterface
        public String platform() {
            return onServerPage() ? "android" : "";
        }

        @JavascriptInterface
        public void changeServer() {
            if (!onServerPage()) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    showSetup(null);
                }
            });
        }

        @JavascriptInterface
        public void print(String kind, double widthMm) {
            if (!onServerPage()) return;
            runOnUiThread(new Runnable() {
                public void run() {
                    printPage();
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String mime, final String base64) {
            if (!onServerPage()) return;
            final byte[] data = Base64.decode(base64, Base64.DEFAULT);
            runOnUiThread(new Runnable() {
                public void run() {
                    writeDownload(name, mime, data);
                }
            });
        }
    }

    // ---------- Impression ----------

    private void printPage() {
        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        final String job = getString(R.string.print_job);
        final PrintDocumentAdapter inner = web.createPrintDocumentAdapter(job);
        // On prévient la page quand l'impression est terminée (elle retire alors son mode « ticket »)
        PrintDocumentAdapter adapter = new PrintDocumentAdapter() {
            @Override
            public void onStart() {
                inner.onStart();
            }

            @Override
            public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal cancellationSignal,
                                 LayoutResultCallback callback, Bundle extras) {
                inner.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
            }

            @Override
            public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal cancellationSignal,
                                WriteResultCallback callback) {
                inner.onWrite(pages, destination, cancellationSignal, callback);
            }

            @Override
            public void onFinish() {
                inner.onFinish();
                web.evaluateJavascript("window.__baqalaPrintDone && window.__baqalaPrintDone()", null);
            }
        };
        pm.print(job, adapter, new PrintAttributes.Builder().build());
    }

    // ---------- Enregistrement des exports (Excel...) ----------

    private void writeDownload(String name, String mime, byte[] data) {
        String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
        try {
            Uri opened = null;
            if (Build.VERSION.SDK_INT >= 29) {
                // MediaStore.Downloads (Android 10+), référencé par ses noms pour compiler avec un SDK ancien
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                v.put("_display_name", safe);
                v.put("mime_type", mime);
                v.put("relative_path", Environment.DIRECTORY_DOWNLOADS + "/BAQALA");
                v.put("is_pending", 1);
                Uri uri = cr.insert(Uri.parse("content://media/external/downloads"), v);
                if (uri == null) throw new IllegalStateException("insert");
                OutputStream os = cr.openOutputStream(uri);
                os.write(data);
                os.close();
                v.clear();
                v.put("is_pending", 0);
                cr.update(uri, v, null, null);
                opened = uri;
            } else {
                File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "BAQALA");
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("mkdirs");
                FileOutputStream fos = new FileOutputStream(new File(dir, safe));
                fos.write(data);
                fos.close();
            }
            Toast.makeText(this, getString(R.string.saved, safe), Toast.LENGTH_LONG).show();
            if (opened != null) {
                Intent view = new Intent(Intent.ACTION_VIEW);
                view.setDataAndType(opened, mime);
                view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try {
                    startActivity(view);
                } catch (Exception ignored) {
                    // Aucune application pour ouvrir ce type de fichier : il reste dans Téléchargements
                }
            }
        } catch (Exception e) {
            Toast.makeText(this, R.string.save_failed, Toast.LENGTH_LONG).show();
        }
    }
}
