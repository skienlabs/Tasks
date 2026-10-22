import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.roborazzi)
}

// Firebase config: put the file downloaded from the Firebase console at app/app/google-services.json.
val hasFirebaseConfig = file("google-services.json").exists()
if (hasFirebaseConfig) apply(plugin = libs.plugins.google.services.get().pluginId)

// Signing key: app/keystore.properties (never committed).
val keystoreProps = Properties().apply {
    val f = rootProject.file("keystore.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

// Server address baked into the build: app/tasks.properties -> apiUrl=https://tasks.example.com
val appProps = Properties().apply {
    val f = rootProject.file("tasks.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
val apiUrl: String = (findProperty("TASKS_API_URL") as String?) ?: appProps.getProperty("apiUrl", "")

android {
    namespace = "com.skienlabs.tasks"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.skienlabs.tasks"
        minSdk = 28
        targetSdk = 36
        versionCode = 11
        versionName = "1.7.0"
        buildConfigField("String", "API_URL", "\"${apiUrl.trimEnd('/')}\"")
        buildConfigField("boolean", "FIREBASE_CONFIGURED", hasFirebaseConfig.toString())
    }

    signingConfigs {
        if (keystoreProps.getProperty("storeFile") != null) {
            create("release") {
                storeFile = rootProject.file(keystoreProps.getProperty("storeFile"))
                storePassword = keystoreProps.getProperty("storePassword")
                keyAlias = keystoreProps.getProperty("keyAlias")
                keyPassword = keystoreProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
        }
        debug {
            // Same package and signing key as release, so Google sign-in works with one Firebase registration.
            signingConfigs.findByName("release")?.let { signingConfig = it }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/*.kotlin_module", "DebugProbesKt.bin")
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }

    lint {
        abortOnError = true
        checkReleaseBuilds = true
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion", "ObsoleteLintCustomCheck")
    }
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
}

// A release must never ship without Firebase or a server address.
tasks.configureEach {
    if (name == "preReleaseBuild") {
        doFirst {
            check(hasFirebaseConfig) { "Missing app/app/google-services.json (download it from the Firebase console)." }
            check(apiUrl.startsWith("https://")) { "Set apiUrl=https://... in app/tasks.properties" }
            check(keystoreProps.getProperty("storeFile") != null) { "Missing app/keystore.properties (signing key)." }
        }
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.splashscreen)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(libs.datastore.preferences)
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.auth)
    implementation(libs.credentials)
    implementation(libs.credentials.play)
    implementation(libs.googleid)
    implementation(libs.glance.appwidget)
    implementation(libs.profileinstaller)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}
