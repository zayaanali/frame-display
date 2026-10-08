# Running on a server

The server renders the frame every minute and runs the phone app. Screens
only display what it serves: the Kindle downloads `/frame.png`, a tablet opens
`/board`. Any always-on Linux machine works (64-bit; Playwright's Chromium
doesn't run on 32-bit Raspberry Pi OS).

Everything runs headless: Playwright launches Chromium without a window, so
the server needs no monitor, desktop or X server. Set it up over SSH; the
services below keep running after you log out.

## 1. Copy the project over

From the dev machine. This includes `config.json` (API keys) and
`kitchen.json`, which git doesn't track:

```sh
rsync -av --exclude node_modules --exclude out --exclude .cache \
  ~/Projects/frame-gen/ USER@SERVER:~/frame-gen/
```

## 2. Install (on the server)

Needs Node 20 or newer.

```sh
cd ~/frame-gen
npm ci
sudo npx playwright install-deps chromium   # system libraries Chromium needs
npx playwright install chromium
npm run render                              # should print "wrote out/frame.png ..."
```

## 3. Run as services

`frame-app` serves the phone app and `/frame.png` on port 8080; the timer
re-renders the frame every minute. Both pin the time zone to Chicago, since
the clock on the display uses it.

```sh
mkdir -p ~/.config/systemd/user
cp deploy/frame-app.service deploy/frame-render.service deploy/frame-render.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now frame-app.service frame-render.timer
sudo loginctl enable-linger "$USER"         # keep them running when logged out and after reboot
```

The units assume the project is at `~/frame-gen` and `node` is on the default
PATH. If Node came from nvm, replace `/usr/bin/env node` in the two
`.service` files with the full path from `which node`.

Check on them:

```sh
systemctl --user status frame-app frame-render.timer
journalctl --user -u frame-app -u frame-render -f
```

If the server has a firewall, open the port: `sudo ufw allow 8080/tcp`.

## 4. Point the Kindle at it

**Without jailbreak:** open the Kindle's web browser (Experimental) and go to
`http://SERVER:8080/kindle`. It shows the frame and reloads every minute.
To stop the screensaver from covering it, type `~ds` in the home-screen
search box (works on Kindle 4 / Touch era firmware). The browser's toolbar
takes some of the screen.

**Jailbroken:** full-screen and cleaner. Copy `deploy/kindle/frame.sh` to the
Kindle's USB drive as `frame/frame.sh`, set `SERVER` in it, then run it from
a shell on the Kindle (KUAL or SSH):

```sh
nohup sh /mnt/us/frame/frame.sh > /dev/null 2>&1 &
```

## Tablet

Open `http://SERVER:8080/board` in the tablet's browser. It's the same
template as the e-ink image, scaled to the screen, and refreshes every 30
seconds (on the :00 and :30 marks). If the server can't be reached it keeps
the last board up with an "OFFLINE" tag.

To keep it on screen:

- iPad: Share → Add to Home Screen (opens without browser bars), turn
  Auto-Lock off in Settings → Display & Brightness, and use Guided Access
  to lock it to the page.
- Android: add to home screen from Chrome's menu; set screen timeout to the
  maximum or use a kiosk browser such as Fully Kiosk.

## Updating

Re-run the rsync from step 1, then on the server:

```sh
cd ~/frame-gen && npm ci && systemctl --user restart frame-app
```

## API usage

Each render makes one Bus Tracker and one Train Tracker request, so a render
every minute is about 1,440 of each per day, well under CTA's default limits.
