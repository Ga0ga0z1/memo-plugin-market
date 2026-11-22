plugins {
    id("com.android.application") version "8.10.1"
}

android {
    namespace = "com.example.memo.companion"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "com.example.memo.companion"
        minSdk = 34
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"
    }
}
