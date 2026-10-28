# BBX Broadcast Studio — Community v1.0.1

**Free live-only controller for Beyblade tournament broadcasts.**

The installer is built by the supplied `.github/workflows/build-windows.yml` workflow. **A compiled Windows Setup.exe is not included in the source ZIP**; it must be compiled on a Windows runner or Windows PC using the supplied Inno Setup project. The ZIP is for development and source review.

### Source edition (Windows, macOS, Linux)

Requires Node.js 22 or later if running the source archive. No `npm install` is needed (zero third-party runtime dependencies).

- Windows: double-click `START-BBX-COMMUNITY.bat`
- macOS/Linux: run `./start-linux-mac.sh`
- Development: `node server.js`

Controller: **http://127.0.0.1:3784/**

## OBS Browser Source URLs

Add an **OBS Browser Source** with these settings:
| Horizontal | `http://127.0.0.1:3784/outputs/horizontal.html` | 1920 | 1080 |
| Vertical | `http://127.0.0.1:3784/outputs/vertical.html` | 1080 | 1920 |

The browser-source backgrounds are transparent. On a normal browser window smaller than the overlay, the page automatically scales the complete output into view, fixing the vertically positioned graphics being below the fold. In OBS, set the native width and height shown above; native-size sources render unscaled. There is also an **Open browser preview** link beside each output on the controller. Keep the server running while streaming. Sources and controller update live through server-sent events.

**Important:** OBS must run on the same computer as BBX Community because Community v1.0.1 intentionally listens on localhost only. Other computers and phones cannot access the controller in this version.

## Quick workflow

1. Open the controller. Enter both player names and click **Save names**.
2. Choose the target score (default 4). Add an OBS Browser Source for horizontal or vertical output.
3. Score Spin (+1), Over (+2), Burst (+2), or Xtreme (+3); use **−1 Point** for a correction.
4. Use **Round Win** to record a round win and **Load Next Round** to increase the round number and clear *current round* point totals. Match statistics persist across rounds until **Reset Match**. This is intentionally manual; it does not automatically call the winner or change rounds when someone reaches the point target.
5. Use judge buttons to show match calls. **Judge graphics automatically disappear after 5 seconds** on the server and overlays, or click **Hide Judge Graphic** to clear early. **Match Win** marks the winner until **Reset Match**.
6. **Undo** reverts the preceding controller operation (up to 80 actions in the current session). **Swap Sides** also swaps the players' scores and rounds.
7. Set horizontal and vertical player panels to Full, Mini, or Hidden. Full player panels show each player’s name, rounds won, match point total, number of finishes, and Spin/Over/Burst/Xtreme finish counts. The centered scorebug displays only point totals (no duplicate names). Finish callouts pop out from the scoring player’s side. Hide panels to use only the points scorebug.

## User data, operation, and security

Community ships with generic placeholder player names only. It has no seeded tournament or player records and has no registration/login system.

- Windows state: `%LOCALAPPDATA%\BBX Broadcast Studio\Community\state.json`
- Linux state: `~/.local/share/bbx-community/state.json` (or `$XDG_DATA_HOME`)
- macOS source state: `~/.local/share/bbx-community/state.json`

The state stays in the user's profile so app upgrades and uninstallations do not automatically remove saved match settings. To reset completely, close the app and delete the file above. The Undo history is session-only.

Community only binds `127.0.0.1` and checks request origins. Do not expose the server using public tunnels, reverse proxies, or internet-facing port forwards. This edition is intended for same-device OBS production, not remote crew operations.

Use the provided server rather than opening the overlay HTML files directly from disk.

## Building the Windows installer

1. Put this Community folder's contents in the **root** of a GitHub repository.
2. Open GitHub → **Actions** → **Build BBX Community Windows Installer** → **Run workflow**.
3. The workflow tests the software, downloads and SHA-256-checks the official Windows Node runtime, compiles the included Inno Setup script, and uploads the `BBX-Community-Windows-Setup` artifact.
4. Download the artifact containing `BBX-Community-v1.0.1-Setup.exe` and test it on a clean Windows 10/11 machine.
5. Before a public launch, digitally sign the installer and configure official release distribution. Unsigned installers may produce Microsoft SmartScreen warnings.

**No license activation, tier-2 features, account creation, or remote network access is included.**

## Tests

Run `npm test` using Node.js 22+ to verify the server, security boundaries, scoring, undo, persistent state, and OBS output routes.

## Changes in v1.0.1

- Broadcast layout is now **player-panel-first**, with each side displaying cumulative live match statistics and the centered bug reserved for points. Full/Mini/Hidden controls remain; hidden panels effectively provides a points-only scoreboard option.
- Finish graphics animate out from the scoring player's corresponding side. Spin (+1), Over (+2), Burst (+2), and Xtreme (+3) use distinct colored treatment.
- Judge calls automatically disappear after **5 seconds**; expiry is enforced by both the server and browser sources, including reconnects and restarts.
- Fixed standalone vertical-output viewing by fitting the complete 1080×1920 transparent stage into smaller browser windows. OBS still uses the native 1080×1920 output.
- State saved by v1.0 is safely migrated on load: finish counters default to zero when absent, and the existing round score seeds total match points.

**Visual inspection:** Server/API behavior is covered by automated tests. Test both output sizes in OBS on the target Windows machine before release.
