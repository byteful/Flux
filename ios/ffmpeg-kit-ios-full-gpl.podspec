
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
   s.source           = { :http => 'https://github.com/NooruddinLakhani/ffmpeg-kit-ios-full-gpl/archive/refs/tags/latest.zip' }

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
