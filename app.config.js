const packageJson = require('./package.json');
const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? "Flux (Dev)" : "Flux",
    slug: "flux",
    version: packageJson.version,
    orientation: "default",
    icon: IS_DEV ? "./assets/icon-dev.png" : "./assets/icon.png",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000"
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? "me.byteful.flux.dev" : "me.byteful.flux",
      buildNumber: packageJson.version,
      infoPlist: {
        CFBundleDisplayName: IS_DEV ? "Flux (Dev)" : "Flux",
        UIBackgroundModes: [
          "audio",
          "processing"
        ],
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSAllowsArbitraryLoadsForMedia: true,
          NSAllowsArbitraryLoadsInWebContent: true,
          NSExceptionDomains: {
            "vidsrc.me": {
              "NSIncludesSubdomains": true,
              "NSExceptionAllowsInsecureHTTPLoads": true
            },
            "vidsrc.su": {
              "NSIncludesSubdomains": true,
              "NSExceptionAllowsInsecureHTTPLoads": true
            }
          }
        },
        "ITSAppUsesNonExemptEncryption": false
      }
    },
    android: {
      versionCode: packageJson["version-iteration"],
      versionName: packageJson.version,
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#000000"
      },
      package: IS_DEV ? "me.byteful.flux.dev" : "me.byteful.flux",
      permissions: [
        "android.permission.MODIFY_AUDIO_SETTINGS",
        "android.permission.SET_ORIENTATION",
        "android.permission.WRITE_SETTINGS"
      ]
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-screen-orientation",
      [
        "expo-video",
        {
          "supportsBackgroundPlayback": true,
          "supportsPictureInPicture": true
        }
      ],
      "expo-secure-store",
      "expo-background-task"
    ],
    assetBundlePatterns: [
      "**/*"
    ],
    owner: "bytefuls",
    extra: {
      buildDate: new Date().toISOString(),
      eas: {
        projectId: "95d18493-36d1-4188-b99d-e76d6bdc446e"
      }
    }
  }
};