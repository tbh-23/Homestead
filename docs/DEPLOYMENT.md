# Running Harrington for the whole family

This runbook takes Harrington from "works on the computer it was installed on"
to "the family opens it from a tablet, a phone and a laptop". Follow one
option below from start to finish. Every command is run on the host computer
unless a step says otherwise.

## The one rule: one host, one data folder, everything else is a browser

- **One always-on computer runs `node server.mjs`** (or `npm start`, or the
  Docker container) with **one data directory** (`data/private/`, or
  `HARRINGTON_DATA_DIR`). Pick a computer that stays on: a desktop, a mini PC,
  a home server.
- **Every other device is only a browser** pointed at that host. Tablets and
  phones install no Harrington software (option 1 adds the Tailscale app).
- **Never run two Harrington servers against the same folder**, and never put
  the data directory in a synced folder (iCloud Drive, Dropbox, OneDrive,
  Syncthing, Google Drive) shared with another server. Two servers each think
  they own the file, and the sync tool will silently keep one copy and drop
  the other's changes.

Several browsers at once are safe: saves are versioned, and a device that saved
second reloads the latest data and says so instead of overwriting it.

## Why HTTPS matters: the microphone

Browsers allow the microphone and the speech service only on a *secure
context*: `https://` pages, or `http://localhost` / `http://127.0.0.1` on the
computer itself. A tablet opening `http://192.168.1.20:4173` is not a secure
context, so **recording and live transcript do not work there**, whatever
Harrington does. Options 1 and 2 give every device an `https://` address.
Option 3 alone does not.

## Settings reference

| Variable | Default | What it does |
| --- | --- | --- |
| `HARRINGTON_HOST` | `127.0.0.1` | Address the server binds to. Must be an IP address or a host name; the server refuses to start otherwise. |
| `HARRINGTON_PORT` | `4173` | Port. |
| `HARRINGTON_PUBLISHED_HOST` | same as `HARRINGTON_HOST` | The name other devices open, when a proxy or container sits in front (for example your `.ts.net` name). It decides whether the app says "runs on this computer only" or "shared with your other devices", and it is a host name Harrington answers to. |
| `HARRINGTON_ACCESS_TOKEN` | unset | When set (at least 22 characters, mixing character classes; use the command below), every `/api/*` request except `/api/health` needs a sign-in cookie. Each device signs in once at `/login`. |
| `HARRINGTON_ALLOWED_HOSTS` | unset | Extra host names Harrington answers to, comma-separated (for example a Tailscale short name such as `family-host`). |

At startup the server logs the bind address and whether it is loopback, the
published address when it differs, the host names it answers to, and whether
the access token is on (never the token itself). `GET /api/health` reports
`host` (`"loopback"` or `"network"`) and `authEnabled`, and, when the token is
on, `signedIn` for the device asking.

### Host names Harrington answers to

Whatever the bind address, Harrington answers only to `localhost`, the
published address, the bind address, the names in `HARRINGTON_ALLOWED_HOSTS`,
and any IP address. A request for any other name gets `421` and one line of
text. This stops *DNS rebinding*, where a web page on someone else's domain
re-points that domain at your Harrington (including `127.0.0.1` on the same
computer) and reads or changes data through the family's browser. If a device
you use gets that `421`, add the name it uses to `HARRINGTON_ALLOWED_HOSTS` and
restart.

Make a token with:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Keep it like a house key: in a password manager, never in Git, never in a
screenshot.

## Option 1 (recommended): a WireGuard mesh with HTTPS (Tailscale)

A mesh VPN such as [Tailscale](https://tailscale.com) puts the host and the
family's devices on a private network that only they can join, and gives the
host a real HTTPS certificate, so the microphone works on every device. It
also works away from home without opening anything on your router.

### 1. Join every device to the mesh

1. Create a Tailscale account (the free personal plan is enough).
2. Install Tailscale on the **host** and sign in.
3. Install the Tailscale app on **each tablet, phone and laptop** and sign in
   to the same account (or invite family members to your tailnet).
4. In the Tailscale admin console, under **DNS**, turn on **MagicDNS** and
   **HTTPS Certificates**.
5. Find the host's full mesh name on the **Machines** page of the admin
   console. It looks like `family-host.tailnet-name.ts.net`. Below it is
   written `HOSTNAME.ts.net`; use yours.

### 2. Bind Harrington behind the mesh interface

Keep Harrington itself on loopback and let the mesh be its only front door.
`tailscale serve` listens on the host's mesh interface, terminates HTTPS with
the mesh certificate, and forwards to Harrington on the same computer. Nothing
on your home Wi-Fi or the internet can reach port 4173 directly.

```bash
export HARRINGTON_HOST=127.0.0.1
export HARRINGTON_PUBLISHED_HOST=HOSTNAME.ts.net
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here   # recommended, see option 3
npm start
```

The log should say `Bind address 127.0.0.1 is loopback` and `Published address
HOSTNAME.ts.net: other devices open Harrington there`, so the app says it is
shared with your other devices. If anyone opens the MagicDNS short name
(`http://family-host`), add it: `export HARRINGTON_ALLOWED_HOSTS=family-host`.
Only the full `.ts.net` name has an HTTPS certificate, so use that one for
recording.

### 3. Turn on HTTPS through the mesh

```bash
tailscale serve --bg 4173
tailscale serve status
```

`serve status` prints `https://HOSTNAME.ts.net` proxying to
`http://127.0.0.1:4173`. The first HTTPS request can take a few seconds while
the certificate is issued. To stop sharing: `tailscale serve reset`.

Do **not** use `tailscale funnel`: Funnel publishes the site on the public
internet.

### 4. Open it on each device

1. On the tablet, phone or laptop, make sure Tailscale is connected.
2. Open `https://HOSTNAME.ts.net/login`, type the token into the form, and
   press **Sign in**. The browser lands on Harrington and stays signed in. (If
   the token is off, open `https://HOSTNAME.ts.net` instead.)
3. Add it to the home screen (Share, then Add to Home Screen on iPad and
   iPhone; the browser menu on Android).

To keep it running, start Harrington from a service manager (systemd,
launchd, a Docker restart policy) with the same environment variables.
`tailscale serve --bg` is remembered across reboots.

## Option 2: a local reverse proxy with its own certificate authority (Caddy)

Use this when the family does not want a mesh app on every device. A reverse
proxy on the host serves HTTPS on your home network with a certificate from a
small certificate authority (CA) it creates itself. Each device has to trust
that CA's root certificate once. It works only on your home network.

### 1. Give the host a name on your network

Pick a name such as `harrington.home.arpa` and point it at the host's LAN
address: add a DNS entry on your router (often under "Local DNS" or "DHCP
reservations"), or use the host's own `.local` name if your devices resolve it.

### 2. Run Harrington on loopback and Caddy in front

```bash
export HARRINGTON_HOST=127.0.0.1
export HARRINGTON_PUBLISHED_HOST=harrington.home.arpa
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here   # recommended
npm start
```

Install [Caddy](https://caddyserver.com) and use this `Caddyfile`:

```
harrington.home.arpa {
	tls internal
	reverse_proxy 127.0.0.1:4173
}
```

Start it with `caddy run` (or the system service). `tls internal` makes Caddy
create its own local CA and issue and renew the site certificate. Caddy passes
the name the browser used (`harrington.home.arpa`) and sends
`X-Forwarded-Proto: https`, so Harrington answers and marks its sign-in cookie
`Secure`.

### 3. Install the root certificate on each device

Caddy writes the root certificate to `pki/authorities/local/root.crt` under
its data directory:

- Linux, Caddy run by your user: `~/.local/share/caddy/pki/authorities/local/root.crt`
- Linux, Caddy system package: `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`
- macOS: `~/Library/Application Support/Caddy/pki/authorities/local/root.crt`
- Windows: `%AppData%\Caddy\pki\authorities\local\root.crt`

Copy **only `root.crt`** (never `root.key`) to each device and trust it:

- **iPad and iPhone:** AirDrop or email the file, open it, then Settings,
  General, VPN & Device Management, install the profile. Then Settings,
  General, About, Certificate Trust Settings, and turn on full trust for it.
- **Android:** Settings, Security (or Security & privacy), Encryption &
  credentials, Install a certificate, CA certificate.
- **macOS:** open the file in Keychain Access, add it to the System keychain,
  open it and set "When using this certificate" to Always Trust.
- **Windows:** double-click, Install Certificate, Local Machine, "Trusted Root
  Certification Authorities".
- **ChromeOS:** `chrome://certificate-manager`, Authorities, Import.
- **Firefox** keeps its own list: Settings, Privacy & Security, Certificates,
  View Certificates, Authorities, Import.

Then open `https://harrington.home.arpa/login` on each device and sign in
with the token (or open `https://harrington.home.arpa` if the token is off).

## Option 3: the built-in access token

`HARRINGTON_ACCESS_TOKEN` is Harrington's own lock. With it set:

- every `/api/*` request (family data, recordings, lessons, the AI adapter)
  except `/api/health` needs a sign-in cookie, and gets `401` with a short page
  explaining how to sign in otherwise; the page itself, scripts and styles stay
  open; `/api/health` answers a device that has not signed in with only
  `ok`, `mode`, `host`, `authEnabled` and `signedIn: false`;
- **the sign-in page** at `/login` has one password field. The right token
  sets the cookie (HttpOnly, SameSite=Strict, `Secure` when the request came
  over HTTPS or through a proxy that says so) and goes to the app; a wrong
  token gets a `401` page, is noted in the server log by source address, and
  sets no cookie (after five wrong tries from one address, `/login` backs off
  with `429`). Your password manager can fill it;
- **the sign-in link** `/login?token=YOUR-TOKEN` does the same in one tap,
  which is handy on a phone. It redirects to `/`, so the token leaves the
  address bar, but the link itself stays in the browser's history (see below);
- the cookie is derived from the token, so changing the token signs every
  device out; sign them in again with the new token.
- **AI provider settings** (Settings > AI provider) need the token to change
  once Harrington is shared (bound beyond loopback, or published under another
  name as in options 1 and 2) or when a request comes through a reverse proxy
  that adds `X-Forwarded-For` or a similar header. Without the token, only the
  computer running an unshared Harrington can change them. A forwarder that
  adds no such header, such as `ssh -L`, in front of an unshared server looks
  like that computer itself, so set the token before forwarding to it (see
  [AI-SETUP.md](AI-SETUP.md)).

On its own, with Harrington bound straight to the LAN:

```bash
export HARRINGTON_HOST=0.0.0.0          # or the host's LAN address
export HARRINGTON_ACCESS_TOKEN=paste-your-token-here
npm start
```

and each device opens `http://HOST-LAN-ADDRESS:4173/login` once and signs in.
Devices that use a name instead of the IP address (such as
`family-host.local`) need it in `HARRINGTON_ALLOWED_HOSTS` or
`HARRINGTON_PUBLISHED_HOST`.

**This still needs HTTPS for the microphone.** Over plain `http://` on the LAN,
the tablet can browse, log records and play recordings, but cannot record or
use live transcript. Use the token **together with** option 1 or 2: the mesh or
the proxy provides HTTPS, the token makes sure only family devices that signed
in can read or change data.

### What the token does not protect

- **Sign-in throttling is per source address.** After five wrong tries from one
  address, `/login` backs off up to 60 seconds (`429`) and logs the address.
  Behind a reverse proxy on the same host every device shares `127.0.0.1`, so
  keep using a random 24-byte token (the command above), which the startup
  check expects and which makes guessing hopeless from any number of addresses.
- **The sign-in link is remembered.** `/login?token=...` stays in the
  browser's history and address-bar suggestions, and in synced history on
  every device signed in to the same browser account. Prefer the form; if you
  used the link, delete that history entry.
- **The cookie is a long-lived key.** It lasts 400 days, it is the same on
  every device, and there is no way to sign out just one device: the only way
  to sign out a lost tablet is to change the token, which signs out everyone.
- **Plain HTTP is readable on the Wi-Fi.** Without HTTPS, the token (when you
  sign in) and the cookie (on every request) cross the network unencrypted.
- **`/api/health` is open.** It tells anyone who can reach the server that it
  is Harrington, whether it is shared and whether the token is on; it shows no
  family data.
- **A signed-in device has full access.** Anyone holding one, a child
  included, can read and change everything. The child-view PIN does not stop
  that (see below).

With Docker, the compose file publishes on `127.0.0.1` and reads
`HARRINGTON_PUBLISHED_HOST`, `HARRINGTON_ALLOWED_HOSTS` and
`HARRINGTON_ACCESS_TOKEN` from a `.env` file next to `compose.yaml` (the
repository's `.gitignore` excludes `.env`). Without one it behaves as a
single-computer install: `HARRINGTON_PUBLISHED_HOST` is `127.0.0.1` and there
is no token. For option 1 or 2 keep that port mapping, put Tailscale serve or
Caddy in front of it as above, and put the name devices open and the token in
`.env`, making the token straight into the file so no placeholder is left in
it (the server would accept one as a real token):

```bash
echo "HARRINGTON_PUBLISHED_HOST=HOSTNAME.ts.net" >> .env
echo "HARRINGTON_ACCESS_TOKEN=$(openssl rand -hex 24)" >> .env
chmod 600 .env
```

`HARRINGTON_DATA_VOLUME` in the same file chooses where the data lives: unset,
the `harrington-data` volume; `./data/private`, that folder next to
`compose.yaml` (see the Synology section below).

### The container runs as `node` (uid 1000)

The image runs Harrington as the unprivileged `node` user, uid 1000, not as
root. A new named volume is created writable by it. Two cases need a one-time
change of owner on the host; otherwise every save fails and the log shows
`EACCES`:

- **A bind-mounted folder.** Docker creates a missing folder owned by root, so
  create it and give it to uid 1000 before the first start:
  `mkdir -p data/private && sudo chown -R 1000:1000 data/private`.
- **Data from an image built before this change.** That image ran as root, so
  its files belong to root. For the named volume: `docker compose down`, then
  `docker run --rm -v harrington_harrington-data:/data alpine chown -R 1000:1000 /data`,
  then `docker compose up -d`. For a bind-mounted folder:
  `sudo chown -R 1000:1000 data/private`.

## Synology (Container Manager)

A Synology NAS that stays on is a good host. These steps were written for a
DS920+ on DSM 7.2 or later; other Intel or AMD models that run Container
Manager work the same way. Harrington runs in a container on the NAS,
Tailscale on the NAS gives it an `https://` address, and every other device is
a browser. The AI stays where it is (LM Studio on a laptop, or Gemini); none of
it moves to the NAS. Allow about an hour *(unchecked on DSM)*.

**Why HTTPS, not the NAS's IP address:** the voice recorder (the microphone
and live transcript) works only on a secure context, which
`http://192.168.1.20:4173` is not, and without HTTPS the access token and the
sign-in cookie cross the Wi-Fi unencrypted. (The child-view PIN works either
way.) This section uses option 1, Tailscale: do its step 1 first, for the
account, MagicDNS, HTTPS certificates and the apps on the tablets and phones;
it is not repeated here.

**Not yet checked on a real NAS.** The steps were written from Docker, Compose
and Tailscale's behaviour on Linux and from published Synology guides, not on a
DSM device. Every place marked *(unchecked on DSM)* is a menu name, a default
or a timing that may differ on yours; each says what to look for and what to
do if it does.

Below, `NAS-NAME` is the NAS's name in the tailnet and `TAILNET-NAME` the part
before `.ts.net`, both from the **Machines** page of the Tailscale admin
console; use yours. Commands are typed in an SSH session on the NAS, signed in
with your DSM administrator account.

### 1. Install three packages

In **Package Center**, install **Container Manager**, **Git Server** (it
provides the `git` command) and **Tailscale**. Installing Container Manager
creates the `docker` shared folder, `/volume1/docker` (on another volume it is
`/volume2/docker`; File Station shows which). *(Unchecked on DSM: that Git
Server provides `git` over SSH, and that Container Manager creates the `docker`
folder. Check with `git --version` and `ls -d /volume1/docker` in step 3; if
the folder is missing, create a shared folder named `docker` in Control Panel,
Shared Folder.)*

### 2. Turn on SSH

**Control Panel**, **Terminal & SNMP**, tick **Enable SSH service**, **Apply**.
From a computer on the home network: `ssh your-dsm-user@NAS-LAN-ADDRESS`. Steps
4, 5 (its check) and 6 need SSH, and so do updates; you can turn it off in
between.

### 3. Put Harrington on the NAS

```bash
cd /volume1/docker
git clone https://github.com/simgue/harrington.git
cd harrington
```

If the repository is private, `git` asks for a user name and a password: type
your GitHub user name, and as the password a **fine-grained personal access
token** (GitHub, Settings, Developer settings, Fine-grained tokens) for this
one repository, with **Contents: Read-only** and an expiry date. Do not put the
token in the URL: it would be saved in `.git/config` on the NAS. *(Unchecked on
DSM: that the Git Server package's `git` clones over HTTPS. If `git clone`
fails, use the ZIP below.)*

Without a GitHub token: on GitHub press **Code**, **Download ZIP**, upload the
file to the `docker` folder with File Station, right-click it, **Extract**, and
rename the folder it makes (`harrington-main`) to `harrington`. You still need
SSH for steps 4 to 6. A ZIP copy cannot `git pull`. To update one, extract the
new ZIP to its own fresh folder, stop the Project, move `data/`, `backups/` and
`.env` from the old folder into the new one, rename the old folder to
`harrington-old` and the new one to `harrington`, run
`sudo chown -R 1000:1000 /volume1/docker/harrington/data/private`, and rebuild
(step 5). Do not extract over the old folder: files deleted from Harrington
would stay behind. Delete `harrington-old` once the new one works.

### 4. Make the data folder and the settings file

```bash
cd /volume1/docker/harrington
mkdir -p data/private backups
sudo chown -R 1000:1000 data/private
```

The `chown` matters: inside the container Harrington runs as uid 1000, and a
folder it cannot write to makes every save fail (see "The container runs as
`node`" above). *(Unchecked on DSM: that Synology's folder permissions (ACLs)
on the `docker` shared folder leave this `chown` in force. Step 5's check
shows whether saves work.)*

Then write `.env`, with your NAS name in the first line, and make the access
token straight into it, so no placeholder can be left in by mistake:

```bash
cat > .env <<'END'
HARRINGTON_PUBLISHED_HOST=NAS-NAME.TAILNET-NAME.ts.net
HARRINGTON_DATA_VOLUME=./data/private
END
echo "HARRINGTON_ACCESS_TOKEN=$(openssl rand -hex 24)" >> .env
chmod 600 .env
cat .env
```

Copy the token from the last line into a password manager; each device needs
it once. (If `openssl` is missing, make a token on any computer with Node, with
the command under "Settings reference", and add the line by hand.)

`HARRINGTON_DATA_VOLUME=./data/private` keeps the family's data in
`/volume1/docker/harrington/data/private`, a folder File Station and Hyper
Backup can see, instead of a Docker volume. `compose.yaml` stays as it is in
Git, so `git pull` never conflicts with your settings.

### 5. Create the Project and start it

*(Unchecked on DSM: the menu names, the Web Station page and whether a Project
reads `.env`. The check after the list is what counts.)*

1. Open **Container Manager**, **Project**, **Create**.
2. **Project name:** `harrington`. **Path:** the `docker/harrington` folder.
   **Source:** use the existing `compose.yaml`. Container Manager should offer
   this when it finds the file in the folder; if it offers to create a new one
   instead, the path is wrong.
3. If it shows a web portal (Web Station) page, skip it: Tailscale is the
   front door.
4. **Done** builds the image and starts the container. The first build takes
   a few minutes on a Celeron *(unchecked on DSM)*.

**Check it, and do not skip this.** On the NAS:

```bash
curl -s -H 'Host: NAS-NAME.TAILNET-NAME.ts.net' http://127.0.0.1:4173/api/health; echo
sudo docker inspect --format '{{range .Mounts}}{{.Type}} {{.Source}}{{end}}' $(sudo docker ps -q --filter name=harrington)
```

The first line must show `"ok":true` and `"authEnabled":true`; the second must
show `bind /volume1/docker/harrington/data/private`. Any of these means the
Project did not read `.env`:

- the first line answers `Harrington does not answer to this host name; add
  it to HARRINGTON_ALLOWED_HOSTS.` (without `.env` the published name falls
  back to `127.0.0.1`, so Harrington refuses `NAS-NAME...ts.net`);
- it shows `"authEnabled":false`;
- the mount says `volume`.

Harrington is then running **with no token**, and the family's data would go
into a hidden Docker volume that a Hyper Backup of `data/private` never sees.
Then stop and delete the Project in Container Manager and start Harrington over
SSH instead, which reads `.env` for certain:

```bash
cd /volume1/docker/harrington
sudo docker compose up -d --build
```

Older DSM versions may have only `docker-compose` (with a hyphen); if
`docker compose` says it is not a command, run
`sudo docker-compose up -d --build`. Run the check again. Use the same command
for every update below instead of the Project's **Build**.

The container's log (in Container Manager, or `sudo docker logs` with the
container name) shows the startup lines described under "Settings reference".
The port is published on `127.0.0.1:4173` only, so nothing on the home network
reaches Harrington except through Tailscale.

### 6. Give it an HTTPS address with Tailscale

1. Open **Tailscale** from the DSM main menu and sign in to the family's
   tailnet.
2. In the Tailscale admin console, under **DNS**, check that **MagicDNS** and
   **HTTPS Certificates** are on (option 1, step 1).
3. On DSM the `tailscale` command is not on the `PATH` *(unchecked on DSM)*;
   it is in the package folder. Check that it is there, then turn on serve:

   ```bash
   ls -l /var/packages/Tailscale/target/bin/tailscale
   sudo /var/packages/Tailscale/target/bin/tailscale serve --bg http://127.0.0.1:4173
   sudo /var/packages/Tailscale/target/bin/tailscale serve status
   ```

   `serve status` should show `https://NAS-NAME.TAILNET-NAME.ts.net` proxying
   to `http://127.0.0.1:4173`. The setting survives reboots. *(Unchecked on
   DSM: the Package Center's Tailscale version, and whether it first prints a
   link to enable Serve for the tailnet.)* If it prints a link, open it, allow
   Serve, and run the command again. Tailscale before 1.52 wrote this
   `tailscale serve https / http://127.0.0.1:4173`; if the command above is
   refused, update the package in Package Center.
4. Tailscale's Synology guide has DSM 7 run `tailscale configure-host` as root
   at every boot, so that apps on the NAS can also reach other devices in the
   tailnet; Harrington needs that only to reach an AI provider by its
   Tailscale address (step 8). **Control Panel**, **Task Scheduler**,
   **Create**, **Triggered Task**, **User-defined script**, user `root`, event
   **Boot-up** (menu names unchecked on DSM), script:

   ```bash
   /var/packages/Tailscale/target/bin/tailscale configure-host; synosystemctl restart pkgctl-Tailscale.service
   ```

   Run it once now (select it, **Run**). An upgrade of the Tailscale package
   undoes it: run the task again after each one, or reboot.

*(Unchecked on DSM: port 443.)* If `https://NAS-NAME.TAILNET-NAME.ts.net` opens
DSM's own sign-in page instead of Harrington, DSM is keeping port 443. Move
Harrington to port 8443:
`sudo /var/packages/Tailscale/target/bin/tailscale serve reset`, then
`sudo /var/packages/Tailscale/target/bin/tailscale serve --bg --https=8443 http://127.0.0.1:4173`,
and add `:8443` to the address everywhere below. Never use `tailscale funnel`.

### 7. Sign in on each device

On each tablet, phone and laptop, do option 1, step 4: Tailscale connected,
open `https://NAS-NAME.TAILNET-NAME.ts.net/login`, type the token once, add it
to the home screen. Then check recording with "Verifying recording from a
second device" at the end of this page.

### 8. Move the family's data from the old install

1. On the old install, press **Export** and keep the
   `harrington-family-<date>.json` file. It holds the family document, not the
   recordings or the AI settings.
2. Stop the old server, so nobody keeps saving to it.
3. On the NAS install, press **Import**, check the preview, and confirm.
4. Recordings, if you want to keep them: copy the old `data/private/audio/`
   folder into `docker/harrington/data/private/` with File Station, then run
   `sudo chown -R 1000:1000 /volume1/docker/harrington/data/private` again.
5. Set the AI provider again under **Settings > AI provider**: API keys are
   never exported or backed up. For LM Studio on a laptop, turn on its option
   to serve on the local network and use the laptop's home-network address,
   such as `http://192.168.1.30:1234/v1` ([AI-SETUP.md](AI-SETUP.md)). Plain
   `http://` is fine while it stays on the home network. Reaching the laptop
   by its Tailscale address instead needs the boot-up task in step 6.

### What to expect the first time

The container starts in a few seconds. Harrington downloads the curriculum at
the pinned revision in two moments, checks every file against its SHA-256 and
keeps it in `data/private/taxonomy/`; the NAS must be able to reach
`raw.githubusercontent.com` both times.

- **The first time a device opens the app:** about 6 MB (the four curriculum
  files, about 3 MB, then the 2.7 MB Australian Curriculum standards).
- **The first time a page offers a teaching guide** (a topic page, for
  example): the 23.5 MB teaching research, which the server then splits into
  one file per topic, once. Together that is the longer wait, perhaps 20 to 30
  seconds on a Celeron *(unchecked on DSM)*; the log then says
  `Split the teaching research into ... topic files`.

Neither happens again, even after a rebuild: both are kept in the data folder.

### Updating

1. Press **Export** in the app and keep the file.
2. On the NAS:

   ```bash
   cd /volume1/docker/harrington
   git pull
   ```

   A ZIP install has no `git pull`: follow the ZIP update in step 3 instead,
   then continue here.

3. In Container Manager, **Project**, `harrington`, **Action**, **Build**
   *(unchecked on DSM)*. It rebuilds the image from the new code and restarts
   the container. If you started Harrington over SSH in step 5, run
   `sudo docker compose up -d --build` (or `sudo docker-compose up -d --build`)
   in that folder instead.
4. Reload Harrington on every device. A tab may run the old app for up to an
   hour, read-only and harmless (README, "Updating").

### Backups

The data folder is the backup set (README, "Backup and restore"). Use one of:

- **Hyper Backup:** a daily task that backs up `docker/harrington/data/private`
  to a USB drive or another NAS. Turn on client-side encryption: the folder
  holds `secrets.json`, with any API key, besides every note and recording.
- **The same archive as `npm run backup`, made on the NAS:** **Control Panel**,
  **Task Scheduler**, **Create**, **Scheduled Task**, **User-defined script**
  (menu names unchecked on DSM), user `root`, daily at 02:15, with this script:

  ```bash
  cd /volume1/docker/harrington && mkdir -p backups && tar -czf backups/harrington-$(date +%Y-%m-%dT%H-%M-%S).tar.gz --exclude=private/secrets.json --exclude='private/secrets.json.*.tmp' -C data private
  ```

  The archive has the same layout as `npm run backup`'s and leaves out the
  same two things (`scripts/backup.mjs`): `secrets.json` and a half-written
  copy of it. Restore it as the README says, then run
  `sudo chown -R 1000:1000 /volume1/docker/harrington/data/private`. Copy
  `backups/` off the NAS every so often (Hyper Backup can do that too).

The notification bell does not see archives made outside the container:
dismiss "No backup recorded" and it stays quiet for 30 days.

## Keeping the family's data safe

### Nightly backup

`npm run backup` writes `backups/harrington-<timestamp>.tar.gz` with
everything in the data directory, recordings included. Schedule it on the
host. Cron starts with an almost empty `PATH` and no exported variables, so
the entry uses full paths and names the data directory the server uses. Find
the paths with `command -v node` and `pwd` in the Harrington folder, then run
`crontab -e` (Linux and macOS) and add one line (here node is
`/usr/local/bin/node` and Harrington is in `/home/parent/harrington`):

```
15 2 * * * cd /home/parent/harrington && mkdir -p backups && HARRINGTON_DATA_DIR=/home/parent/harrington/data/private HARRINGTON_BACKUP_DIR=/home/parent/harrington/backups /usr/local/bin/node scripts/backup.mjs >> backups/backup.log 2>&1
```

`mkdir -p backups` matters on a fresh clone: the shell opens
`backups/backup.log` before the backup script runs, and fails if the folder is
missing. If the server runs with a different `HARRINGTON_DATA_DIR`, use that
path. `HARRINGTON_BACKUP_DIR` is where the archives go (default `backups/` in
the Harrington folder); naming it in the line keeps them in one known place.
Check the next morning that `backups/backup.log` says `Backed up`.

With Docker, the data lives in the `harrington-data` volume, which Compose
names `harrington_harrington-data` when the folder is called `harrington`
(`docker volume ls` shows the exact name). Back it up with a throwaway
container (`%` must be written `\%` inside a crontab). The command leaves out
`secrets.json`, which holds the AI provider settings saved in the app and any
API key, as `npm run backup` does; enter the key again after a restore:

```
15 2 * * * mkdir -p /home/parent/harrington/backups && /usr/bin/docker run --rm -v harrington_harrington-data:/data:ro -v /home/parent/harrington/backups:/backups alpine tar -czf /backups/harrington-docker-$(date +\%Y-\%m-\%dT\%H-\%M-\%S).tar.gz --exclude=data/secrets.json --exclude='data/secrets.json.*.tmp' -C / data >> /home/parent/harrington/backups/backup.log 2>&1
```

To restore it, close Harrington on every device first (a tab left open would
otherwise see its next change refused and offer to put it back on the
restored data), then `docker compose down`, then
`docker run --rm -v harrington_harrington-data:/data -v /home/parent/harrington/backups:/backups alpine sh -c 'rm -rf /data/* && tar -xzf /backups/FILE.tar.gz -C / && chown -R 1000:1000 /data'`,
then `docker compose up -d`. The `chown` hands the restored files to the
`node` user the container runs as; without it they come back owned by root
and every save fails with `EACCES`.

The server reads the same folder: the notification bell warns when the newest
archive in `HARRINGTON_BACKUP_DIR` (default `backups/`) is more than a week
old, or when there is none. Run the server with the same value the backup
uses. The Docker image does not include `scripts/` and `compose.yaml` mounts
no backup folder, so with Docker the volume backup above is the backup; to
let the bell see those archives, mount the host folder they go to (for
example `/home/parent/harrington/backups:/backups`) and set
`HARRINGTON_BACKUP_DIR=/backups`. Otherwise dismiss "No backup recorded" and
it stays quiet for 30 days.

On Windows, use Task Scheduler to run `node scripts\backup.mjs` daily, with
the full path to `node.exe`, the Harrington folder as the start directory,
and `HARRINGTON_DATA_DIR` set if the server uses one. Copy the `backups/`
folder to a second place (an external drive, another computer) every so
often; a backup on the same disk does not survive that disk. See the README's
"Backup and restore" section for how to restore a plain install.

### Export before every upgrade

Before pulling a new version:

1. In the app, press **Export** and keep the `harrington-family-<date>.json`
   file. On a computer it is in the sidebar's family box; on a phone, or a
   tablet held upright, it is at the bottom of the learner selector.
2. Run `npm run backup` (or the Docker backup command above).
3. Stop Harrington, update (`git pull`, then `npm ci`), and start it again
   with the same environment variables.
4. Open the app on the host and on one other device and check the learners
   are there.

### The child-view PIN

The first time someone presses **Grown-ups** in the child view, Harrington asks
for a 4-digit PIN; after that the PIN is needed to leave the child view. It is
saved with the family data, so it is the same on every device. It keeps a
child on the child screen of a shared tablet; it is not a password. Anyone who
reloads the page is back in the grown-up view, and it does not replace the
access token.

## What a family should do

A short checklist from the threat model ([security/THREAT-MODEL.md](security/THREAT-MODEL.md)).
Each item closes a way family data could leak or be lost today.

1. **Turn the access token on whenever another person or program could reach
   the port, even on one computer.** Harrington refuses foreign `Host` names on
   loopback (DNS rebinding), and with the token on every `/api/*` route also
   requires a sign-in cookie, so other browser profiles, local users and
   unauthorised scripts on the host cannot read or change family data. Make the
   token with the command above, keep it in a password manager, and sign in
   with the form, not the link.
2. **Share it over HTTPS (option 1 or 2), never by opening a port on your
   router**, and never with `tailscale funnel`.
3. **Encrypt the host computer's disk** (FileVault on macOS, BitLocker or Device
   Encryption on Windows, LUKS on Linux, or an encrypted shared folder on
   Synology DSM) and lock its screen. Family data, recordings and backups are
   plain files on it.
4. **Store backup archives and exported JSON files only on an encrypted drive**
   and make the folder private to you: `chmod 700 backups data/private` on
   Linux and macOS. A backup has every note, transcript and recording.
5. **Treat an export like the family diary.** It holds learner names, birth
   months, notes, transcripts, AI analyses and the child-view PIN hash in plain
   text. Never email plaintext exports or backup archives, and never put them in
   a shared cloud folder. If an export or archive has to travel, put it in an
   encrypted archive first and delete the plaintext file once imported.
6. **Lock a child to the app, not just the child view.** The PIN keeps a
   child on the child screen, but a reload brings back the grown-up view, and
   the PIN is set by whoever presses **Grown-ups** first: set it yourself
   before you hand the tablet over. Use the tablet's own lock for the rest:
   Guided Access on iPad, screen pinning on Android.
7. **If a signed-in tablet or phone is lost,** change
   `HARRINGTON_ACCESS_TOKEN`, restart Harrington and sign the other devices in
   again. That is the only way to sign one device out.
8. **Open Harrington from your bookmark or home-screen icon only.** Do not
   open a Harrington link someone sends you, such as one to a single
   recording.
9. **With a cloud AI provider, assume it keeps what it is sent.** Learner
   names are replaced, but nicknames, other people's names, and everything
   said in a recorded discussion you ask it to analyse are sent as they are,
   and so are your notes when you tick "Include my notes". A provider on the
   host computer (Ollama) keeps all of it at home. Use `https://` for a
   provider on the internet. Plain `http://` is fine while it stays on your
   computer or your home network: `http://127.0.0.1:11434/v1`, or, from
   Docker, `http://host.docker.internal:11434/v1` as the README shows. Never
   send it to a provider on the internet over plain `http://`.
10. **Close Harrington on every device before restoring a backup.** A tab
    left open sees its next change refused, reloads the restored data and
    offers to put that change back, which is confusing in the middle of a
    restore. Close every tab and the home-screen app on each tablet, phone
    and computer, restore, start Harrington, then open it again.
11. **Update with care:** export, run a backup, then update (see "Export
    before every upgrade" above).

## Verifying recording from a second device

After option 1 or 2, on a tablet or phone that is **not** the host:

1. Connect it to the mesh (option 1) or install the root certificate
   (option 2).
2. Open `https://HOSTNAME/login` and sign in with the token (or open the
   `https://` address if the token is off). The address bar shows a padlock,
   not a warning.
3. Open the **Guide** and check that it says Harrington is shared with your
   other devices. With the token on, "signed in" shows under "Private family
   space" in the sidebar on a wide screen, or under "Family data" at the
   bottom of the learner selector on a phone or a tablet held upright (they
   have no sidebar).
4. On the dashboard press **Record what happened**, allow the microphone when
   the browser asks, speak for ten seconds, and stop.
5. Check the recording plays back on the tablet, then open **Records** on the
   host computer and play the same recording there.
6. On the tablet, open `/api/health` in a new tab (it shows `"host":"network"`
   and, with the token, `"signedIn":true`). In a private window that has not
   signed in, `/api/state` shows the sign-in page instead of data.
