# Flux 🎬

Flux is a cross-platform mobile video streaming application built with React Native and Expo for iOS and Android.

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

To build and run this project yourself, you'll need Node.js, npm/yarn, and the Expo Go app or development environment set up for React Native.

1.  **Clone the repository:**
    ````bash
    git clone <your-repo-url>
    cd Flux/app
    ````
2.  **Install dependencies:**
    ````bash
    npm install
    # or
    yarn install
    ````
3.  **Run the app:**
    *   **Using Expo Go:**
        ````bash
        npx expo start
        ````
        Scan the QR code with the Expo Go app on your iOS or Android device.
    *   **On iOS Simulator:**
        ````bash
        npx expo run:ios
        ````
    *   **On Android Emulator/Device:**
        ````bash
        npx expo run:android
        ````


## TO-DO 📝

-   [ ] View seasons/episodes list directly from the video player view.
-   [x] Add controls for adjusting screen brightness within the video player.
-   [x] Implement search functionality.
-   [x] Add user preferences/settings screen.

## Disclaimer ⚠️

As mentioned, Flux accesses third-party APIs (TMDB, Vidsrc) to fetch metadata and streaming links. The availability and legality of content depend entirely on these external services. This app is intended for personal and educational use only. I am not responsible for how the application is used or for the content accessed through it.

## Suggestions and Bug Reports 🐞

Please don't hesitate to open an issue if you have a suggestion or find a bug. While primarily maintained for personal use, contributions and feedback to improve the app for others are welcome!
