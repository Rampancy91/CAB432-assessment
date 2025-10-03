@echo off
echo Creating test videos for load testing...

echo Creating video 1 (30s, testsrc pattern)...
ffmpeg -f lavfi -i testsrc=duration=30:size=640x480:rate=30 -c:v libx264 -pix_fmt yuv420p test-video-1.mp4 -y

echo Creating video 2 (30s, testsrc2 pattern)...
ffmpeg -f lavfi -i testsrc2=duration=30:size=854x480:rate=30 -c:v libx264 -pix_fmt yuv420p test-video-2.mp4 -y

echo Creating video 3 (30s, color test pattern)...
ffmpeg -f lavfi -i color=c=blue:duration=30:size=720x480:rate=30 -c:v libx264 -pix_fmt yuv420p test-video-3.mp4 -y

echo.
echo Test videos created successfully!
echo File sizes:
for %%f in (test-video-*.mp4) do echo %%f: %%~zf bytes

echo.
echo Videos ready for upload testing!
pause