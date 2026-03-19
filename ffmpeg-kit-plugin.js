const fs = require('fs');
const path = require('path');
const {
 withPlugins,
 withDangerousMod,
 withAppBuildGradle,
 withProjectBuildGradle,
 withPodfileProperties,
 withCocoaPodsImport,
} = require('@expo/config-plugins');
const {
 mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode');

const withFfmpegKitIos = (config, { iosUrl }) => {
 return withDangerousMod(config, [
   'ios',
   async (cfg) => {
     const { platformProjectRoot } = cfg.modRequest;
     const podspecPath = path.join(
       platformProjectRoot,
       'ffmpeg-kit-ios-full-gpl.podspec',
     );
     const podspec = `
Pod::Spec.new do |s|
   s.name             = 'ffmpeg-kit-ios-full-gpl'
   s.version          = '6.0' # Must match what ffmpeg-kit-react-native expects for this subspec
   s.summary          = 'Custom full-gpl FFmpegKit iOS frameworks from self-hosted source.'
   s.homepage         = 'https://github.com/arthenica/ffmpeg-kit' # Or your repo
   s.license          = { :type => 'LGPL' } # Or the correct license
   s.author           = { 'Your Name' => 'your.email@example.com' } # Update with your info
   s.platform         = :ios, '12.1'
   s.static_framework = true

   # Use the HTTP source to fetch the zipped package directly.
   s.source           = { :http => '${iosUrl}' }

   # Adjust these paths if your zip structure is different.
   # These paths are relative to the root of the extracted zip.
   s.vendored_frameworks = [
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libswscale.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libswresample.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavutil.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavformat.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavfilter.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavdevice.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/libavcodec.xcframework',
     'ffmpeg-kit-ios-full-gpl-latest/ffmpeg-kit-ios-full-gpl/6.0-80adc/ffmpegkit.xcframework'
   ]
end
`;
     fs.writeFileSync(podspecPath, podspec);

     const podfilePath = path.join(platformProjectRoot, 'Podfile');
     let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

     const newPodEntry = `pod 'ffmpeg-kit-ios-full-gpl', :podspec => './ffmpeg-kit-ios-full-gpl.podspec'`;

     if (!podfileContent.includes(newPodEntry)) {
       const anchor = `use_expo_modules!`; // New, more reliable anchor
       if (podfileContent.includes(anchor)) {
         podfileContent = mergeContents({
           tag: 'ffmpeg-kit-custom-pod',
           src: podfileContent,
           newSrc: newPodEntry,
           anchor: new RegExp(
             `^\\s*${anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
           ),
           offset: 1, // Insert on the line *after* the anchor
           comment: '#',
         }).contents;
       } else {
         // Fallback if 'use_expo_modules!' is not found (less likely in modern Expo)
         // Try to insert it after the main target declaration
         const appName = config.name; // From app.json/app.config.js
         const targetAnchor = `target '${appName}' do`;
         if (appName && podfileContent.includes(targetAnchor)) {
           podfileContent = mergeContents({
             tag: 'ffmpeg-kit-custom-pod-fallback',
             src: podfileContent,
             newSrc: `  ${newPodEntry}`, // Add some indentation
             anchor: new RegExp(
               `^\\s*${targetAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
             ),
             offset: 1, // Insert after the target line
             comment: '#',
           }).contents;
           console.log(
             `[ffmpeg-kit-plugin] Used fallback anchor "target '${appName}' do" for Podfile modification.`,
           );
         } else {
           console.warn(
             `[ffmpeg-kit-plugin] Could not find "use_expo_modules!" or "target '${appName}' do" in Podfile. Custom pod for ffmpeg-kit may not be added correctly. Please check Podfile structure.`,
           );
         }
       }
       fs.writeFileSync(podfilePath, podfileContent);
     }
     return cfg;
   },
 ]);
};

const withFfmpegKitAndroid = (config, { androidUrl }) => {
 // First, patch the ffmpeg-kit-react-native build.gradle
 config = withDangerousMod(config, [
   'android',
   async (cfg) => {
     const { platformProjectRoot } = cfg.modRequest;
     const ffmpegKitBuildGradlePath = path.join(
       platformProjectRoot,
       '..',
       'node_modules',
       'ffmpeg-kit-react-native',
       'android',
       'build.gradle'
     );

     if (fs.existsSync(ffmpegKitBuildGradlePath)) {
       let buildGradle = fs.readFileSync(ffmpegKitBuildGradlePath, 'utf-8');
       
       // Replace the Maven dependency with local AAR
       const originalDependency = /implementation 'com\.arthenica:ffmpeg-kit-'.*/;
       const replacement = `implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')`;
       
       if (buildGradle.match(originalDependency)) {
         buildGradle = buildGradle.replace(originalDependency, replacement);
         
         // Also add the smart-exception dependency if not present
         if (!buildGradle.includes('smart-exception-java')) {
           buildGradle = buildGradle.replace(
             replacement,
             `${replacement}\n  implementation 'com.arthenica:smart-exception-java:0.2.1'`
           );
         }
         
         fs.writeFileSync(ffmpegKitBuildGradlePath, buildGradle);
         console.log('[ffmpeg-kit-plugin] Patched ffmpeg-kit-react-native build.gradle');
       }
     }
     
     return cfg;
   },
 ]);

 config = withAppBuildGradle(config, (cfg) => {
   let buildGradle = cfg.modResults.contents;

   const importUrl = 'import java.net.URL';
   if (!buildGradle.includes(importUrl)) {
     buildGradle = mergeContents({
       tag: 'ffmpeg-kit-import-url',
       src: buildGradle,
       newSrc: importUrl,
       anchor: /^/,
       offset: 0,
       comment: '//',
     }).contents;
   }

   const appFlatDirLibsPath = '\\${projectDir}/../libs';
   const appFlatDirRepo = `
   repositories {
       flatDir {
           dirs "${appFlatDirLibsPath}"
       }
   }`;

   if (
     !buildGradle.match(
       new RegExp(
         `repositories\\s*\\{[\\s\\S]*?flatDir\\s*\\{[\\s\\S]*?dirs\\s*['"]${appFlatDirLibsPath.replace(
           /[$.]/g,
           '\\\\$&',
         )}['"]`,
       ),
     )
   ) {
     buildGradle = mergeContents({
       tag: 'ffmpeg-kit-app-flatdir-repo',
       src: buildGradle,
       newSrc: appFlatDirRepo,
       anchor: /android\s*\{/,
       offset: 1,
       comment: '//',
     }).contents;
   }

   const newDependencies = `
   implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')
   implementation 'com.arthenica:smart-exception-java:0.2.1'`;
   if (!buildGradle.includes("name: 'ffmpeg-kit-full-gpl', ext: 'aar'")) {
     buildGradle = mergeContents({
       tag: 'ffmpeg-kit-dependencies',
       src: buildGradle,
       newSrc: newDependencies,
       anchor: /dependencies\s*\{/,
       offset: 1,
       comment: '//',
     }).contents;
   }

   const downloadBlock = `
// Download AAR
def aarUrl = '${androidUrl}'
def aarFile = file("\${projectDir}/../libs/ffmpeg-kit-full-gpl.aar")

// Ensure directory exists
if (!aarFile.parentFile.exists()) {
   aarFile.parentFile.mkdirs()
}

// Download during configuration if not present
if (!aarFile.exists()) {
   println "[ffmpeg-kit] Downloading AAR from \$aarUrl..."
   try {
       new URL(aarUrl).withInputStream { i ->
           aarFile.withOutputStream { it << i }
       }
       println "[ffmpeg-kit] AAR downloaded successfully"
   } catch (Exception e) {
       println "[ffmpeg-kit] Failed to download AAR during configuration: \${e.message}"
   }
}

afterEvaluate {
   tasks.register("downloadAar") {
       description = "Downloads ffmpeg-kit AAR file"
       group = "ffmpeg-kit"
       outputs.file(aarFile)
       doLast {
           if (!aarFile.exists()) {
               println "[ffmpeg-kit] Downloading AAR from \$aarUrl..."
               new URL(aarUrl).withInputStream { i ->
                   aarFile.withOutputStream { it << i }
               }
               println "[ffmpeg-kit] AAR downloaded successfully"
           }
       }
   }

   preBuild.dependsOn("downloadAar")
}`;

   if (!buildGradle.includes('def aarUrl =')) {
     buildGradle = buildGradle + '\n' + downloadBlock;
   }

   cfg.modResults.contents = buildGradle;
   return cfg;
 });

 config = withProjectBuildGradle(config, (cfg) => {
   let buildGradle = cfg.modResults.contents;

   buildGradle = buildGradle.replace(
     /^\s*ffmpegKitPackage\s*=\s*"full-gpl"\s*(\r?\n)?/m,
     '',
   );

   const projectFlatDirLibsPath = '$rootDir/libs';
   const flatDirString = `        flatDir {\n            dirs "${projectFlatDirLibsPath}"\n        }`;
   const allProjectsRepositoriesRegex =
     /(allprojects\s*\{\s*repositories\s*\{)/;
   const existingFlatDirRegex = new RegExp(
     `allprojects\\s*\\{[\\s\\S]*?repositories\\s*\\{[\\s\\S]*?flatDir\\s*\\{[\\s\\S]*?dirs\\s*['"]${projectFlatDirLibsPath.replace(
       /[$.]/g,
       '\\$&',
     )}['"]`,
   );

   if (!buildGradle.match(existingFlatDirRegex)) {
     const match = buildGradle.match(allProjectsRepositoriesRegex);
     if (match) {
       const insertionPoint = match.index + match[0].length;
       buildGradle =
         buildGradle.substring(0, insertionPoint) +
         '\n' +
         flatDirString +
         buildGradle.substring(insertionPoint);
     }
   }

   cfg.modResults.contents = buildGradle;
   return cfg;
 });

 return config;
};

module.exports = (config, options = {}) => {
 const { iosUrl, androidUrl } = options;

 if (!iosUrl) {
   throw new Error(
     'FFmpeg Kit plugin requires "iosUrl" option. Please provide the iOS download URL in your app.config.ts',
   );
 }

 if (!androidUrl) {
   throw new Error(
     'FFmpeg Kit plugin requires "androidUrl" option. Please provide the Android AAR download URL in your app.config.ts',
   );
 }

 return withPlugins(config, [
   (config) => withFfmpegKitIos(config, { iosUrl }),
   (config) => withFfmpegKitAndroid(config, { androidUrl }),
 ]);
};