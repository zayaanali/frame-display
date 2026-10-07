#!/bin/sh
# Runs on a jailbroken Kindle: downloads the frame from the server every
# minute and draws it full-screen with eips. See deploy/README.md.
#
# Start it with:  nohup sh /mnt/us/frame/frame.sh > /dev/null 2>&1 &

SERVER="http://192.168.1.50:8080"   # your server's address
INTERVAL=60                          # seconds between updates
FULL_EVERY=10                        # full (flashing) refresh every N updates, to clear ghosting

# Keep the Kindle awake (and on Wi-Fi) instead of showing its screensaver.
lipc-set-prop com.lab126.powerd preventScreenSaver 1

n=0
while true; do
  if wget -q -O /tmp/frame.png "$SERVER/frame.png"; then
    if [ $((n % FULL_EVERY)) -eq 0 ]; then
      eips -f -g /tmp/frame.png
    else
      eips -g /tmp/frame.png
    fi
    n=$((n + 1))
  fi
  sleep "$INTERVAL"
done
