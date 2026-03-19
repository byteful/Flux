# Flux 🎬

Flux is a cross-platform mobile video streaming application built with React Native and Expo for iOS and Android.

> [!TIP]
> **To sideload this app, go to https://flux.byteful.me**

## Overview

Flux provides a seamless experience for browsing and watching movies and TV shows. It leverages the power of the **TMDB API** for rich metadata (summaries, posters, ratings, etc.) and integrates with the **Vidsrc API** to fetch streamable video links.

The application is entirely client-side, meaning no backend server is required for scraping or data processing. Flux handles everything directly on the device, offering a user-friendly interface with features designed for media consumption.

> [!WARNING]
> This application is developed for personal use and educational purposes. Due to its nature of accessing potentially copyrighted content via third-party APIs, it will **not** be published on the official App Store or Google Play Store as it may violate their terms of service.

## Features ✨

*   **Cross-Platform:** Runs on both iOS and Android using a single codebase thanks to React Native and Expo.
*   **Rich Metadata:** Fetches detailed information about movies and TV shows from TMDB.
*   **Streaming Integration:** Retrieves video streaming links using the Vidsrc API.
*   **Watch Progress:** Saves your last watched position for movies and episodes.
*   **Auto-Play Next:** Automatically queues and plays the next episode in a series.
*   **Client-Side:** No need for a dedicated server; all processing happens within the app.
*   **Clean UI:** Designed with a focus on usability and a pleasant viewing experience.

## Demo 🎥

https://github.com/user-attachments/assets/725196be-83ae-4b81-be00-90f0dbb7a05e

## Getting Started 🚀

Pre-built APKs and IPAs are available on the [Releases](https://github.com/byteful/Flux/releases) tab. If you want to build from source, follow the instructions below.

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- npm (bundled with Node.js)
- [Git](https://git-scm.com/)

**For iOS builds (macOS only):**
- Xcode (latest stable from the Mac App Store)
- Xcode Command Line Tools (`xcode-select --install`)
- [CocoaPods](https://cocoapods.org/) (`sudo gem install cocoapods`)
- An Apple Developer account (free tier works for personal device builds)

**For Android builds:**
- [Android Studio](https://developer.android.com/studio) with:
  - Android SDK (installed via Android Studio setup wizard)
  - Android SDK Build-Tools
  - Android NDK
- Java Development Kit (JDK 17) — bundled with recent Android Studio versions
- `ANDROID_HOME` environment variable set to your SDK path

### Clone & Install

````bash
git clone https://github.com/byteful/Flux.git
cd Flux/app
npm install
````

The `postinstall` script automatically applies patches and downloads the ffmpeg-kit Android AAR.

### Generate Native Projects

This project uses Expo with a [custom dev client](https://docs.expo.dev/develop/development-builds/introduction/), so native project files must be generated before building:

````bash
npx expo prebuild
````

> [!NOTE]
> Re-run `npx expo prebuild --clean` after changing any native configuration in `app.config.js` or adding/removing Expo plugins.

### Building for iOS

1. Install CocoaPods dependencies:

    ````bash
    cd ios
    pod install
    cd ..
    ````

2. **Run on a connected device (development build):**

    ````bash
    npm run ios
    ````

    This launches the app on a connected physical iOS device with the Expo dev client. You may need to trust the developer certificate on your device under **Settings > General > VPN & Device Management**.

3. **Run on iOS Simulator:**

    ````bash
    npx expo run:ios
    ````

4. **Build a release IPA via Xcode:**

    Open `ios/Flux.xcworkspace` in Xcode, select your signing team under **Signing & Capabilities**, choose your device or "Any iOS Device", then go to **Product > Archive**.

### Building for Android

1. **Run on a connected device or emulator (development build):**

    ````bash
    npm run android
    ````

    This cleans the Gradle build, then launches the app on a connected device/emulator with the Expo dev client. Make sure USB debugging is enabled on a physical device.

2. **Run on Android emulator:**

    ````bash
    npx expo run:android
    ````

3. **Build a release APK:**

    ````bash
    cd android
    ./gradlew assembleRelease
    ````

    The output APK is located at `android/app/build/outputs/apk/release/app-release.apk`.

    > [!WARNING]
    > The release build is currently signed with the debug keystore. For distribution, generate a proper keystore — see the [React Native signing guide](https://reactnative.dev/docs/signed-apk-android).

### Starting the Dev Server

If you're running a development build on a device, start the Metro bundler separately:

````bash
npm start
````

Or with the development variant explicitly:

````bash
npm run start:dev
````


## TO-DO 📝

-   [ ] Watch party system
-   [ ] 'Skip Intro' button
-   [X] Subtitles
-   [X] View seasons/episodes list directly from the video player view.
-   [X] Support AirPlay and Chromecast
-   [X] Live stream sports
-   [x] Add controls for adjusting screen brightness within the video player.
-   [x] Implement search functionality.
-   [x] Add user preferences/settings screen.

## Disclaimer ⚠️

As mentioned, Flux accesses third-party APIs (TMDB, Vidsrc) to fetch metadata and streaming links. The availability and legality of content depend entirely on these external services. This app is intended for personal and educational use only. I am not responsible for how the application is used or for the content accessed through it.

## Suggestions and Bug Reports 🐞

Please don't hesitate to open an issue if you have a suggestion or find a bug. While primarily maintained for personal use, contributions and feedback to improve the app for others are welcome!
