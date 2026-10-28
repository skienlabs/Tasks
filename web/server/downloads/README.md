# Android app download

`Tasks.apk` here is the Android app the web app offers for download ("Get the Android app" on
the sign-in page and in the account menu, and the link in team invite messages), served from
`/download/android`.

Replace it with the new release APK on every Android release (same name), commit it, and deploy:
the Docker image picks it up (`COPY server/downloads`). To serve one from somewhere else, set
`ANDROID_APK_PATH`. Without an APK the download simply doesn't show.
