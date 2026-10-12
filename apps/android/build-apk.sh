#!/usr/bin/env bash
# Compile l'APK Android de BAQALA sans Android Studio ni Gradle.
# Prérequis (Ubuntu/Debian) : sudo apt install openjdk-17-jdk android-sdk-platform-23 aapt zipalign apksigner dalvik-exchange
# Signature : keystore/baqala-release.jks + keystore/keystore.properties (à conserver : nécessaires pour les mises à jour).
set -euo pipefail
cd "$(dirname "$0")"

VERSION_NAME="${VERSION_NAME:-1.0.0}"
VERSION_CODE="${VERSION_CODE:-1}"
ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
OUT=build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets" dist

# Écran de connexion commun avec l'application PC
cp ../shared/connect.html ../shared/icon.svg "$OUT/assets/"

echo "1/6 Ressources"
aapt2 compile --dir res -o "$OUT/res.zip"
aapt2 link -I "$ANDROID_JAR" --manifest AndroidManifest.xml -A "$OUT/assets" \
  --min-sdk-version 23 --target-sdk-version 34 --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" -o "$OUT/base.apk" "$OUT/res.zip"

echo "2/6 Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$ANDROID_JAR" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java')

echo "3/6 Dex"
dalvik-exchange --dex --min-sdk-version=23 --output="$OUT/classes.dex" "$OUT/classes"

echo "4/6 Assemblage"
(cd "$OUT" && python3 -c "import zipfile; z=zipfile.ZipFile('base.apk','a'); z.write('classes.dex','classes.dex'); z.close()")
zipalign -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"

echo "5/6 Signature"
# shellcheck disable=SC1091
source keystore/keystore.properties
apksigner sign --ks keystore/baqala-release.jks --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "pass:$STORE_PASSWORD" --key-pass "pass:$KEY_PASSWORD" \
  --out "dist/BAQALA-${VERSION_NAME}.apk" "$OUT/aligned.apk"

echo "6/6 Vérification"
apksigner verify --print-certs "dist/BAQALA-${VERSION_NAME}.apk" | head -3
echo "APK prêt : apps/android/dist/BAQALA-${VERSION_NAME}.apk"
